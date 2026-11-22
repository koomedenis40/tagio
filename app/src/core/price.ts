import { findMarkers } from './detect';

/** One line of recognised text with its box, in frame pixels. */
export type OcrLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PriceCandidate = {
  amount: number;
  /** The number exactly as read, e.g. "1.299,00". */
  raw: string;
  /** Whole line the number came from; used to find the currency marker. */
  lineText: string;
  /** "unit" for prices per kg, per litre and so on. */
  kind: 'price' | 'unit';
  hasMarker: boolean;
  score: number;
  box: { x: number; y: number; width: number; height: number };
};

export type PriceReading = {
  primary?: PriceCandidate;
  /** Other prices on the same tag (unit price, second price), best first. */
  others: PriceCandidate[];
};

const SEP = "[ ,.'\u00A0\u202F]";
// 1,299.00 | 1 299,00 | 1'299.50 | 450 | 3,49 | 12.5 | 4 99 (split cents) ; optional /- or /= suffix
const NUMBER_RE = new RegExp(
  `(?<![\\d.,])(\\d{1,3}(?:${SEP}\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?(?:\\s\\d{2}(?![\\d.,]))?)(\\s?\\/[-=])?`,
  'g',
);
const UNIT_AFTER = /^\s*(kg|kgs|g|gm|gms|gr|mg|ml|cl|l|lt|ltr|ltrs|litre|liter|oz|lb|lbs|pcs|pc|pk|pack|x|cm|mm|m|%|min|h|hrs?|yrs?|years?|months?|days?)\b/i;
const PER_UNIT = /^\s*(\/\s?|per\s|a\s)(\d+\s?)?(kg|g|gm|100\s?g|l|ltr|litre|liter|ml|100\s?ml|lb|oz|ea|each|pc|pcs|unit|m)\b/i;
const OLD_PRICE = /\b(was|old|rrp|before|save|you save|savings?|regular|reg\.?)\b/i;

/** Turns a number written any common way into a value. Returns NaN when it can't. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/\s?\/[-=]$/, '').trim();
  // Split cents: "4 99" means 4.99 (the cents are printed small on many tags).
  const split = /^(\d{1,3}) (\d{2})$/.exec(s);
  if (split) return Number(`${split[1]}.${split[2]}`);
  s = s.replace(/[ '\u00A0\u202F]/g, ''); // spaces and apostrophes only ever group thousands
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    return Number(s.split(thou).join('').replace(dec, '.'));
  }
  const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
  if (!sep) return Number(s);
  const parts = s.split(sep);
  if (parts.length > 2) return Number(parts.join(''));
  const after = parts[1];
  if (after.length === 3) return Number(parts.join('')); // 1,299 or 1.299 -> thousands
  return Number(`${parts[0]}.${after}`);
}

type Hit = { raw: string; amount: number; kind: 'price' | 'unit'; hasMarker: boolean; hasDecimals: boolean };

/** Finds price-like numbers in one line, skipping weights, dates, percentages and barcodes. */
export function findPricesInLine(text: string): Hit[] {
  const hits: Hit[] = [];
  const { iso, markers } = findMarkers(text);
  const lineHasMarker = iso.length > 0 || markers.length > 0;
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = (m[1] + (m[2] ?? '')).trim();
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = text.slice(Math.max(0, start - 6), start);
    const after = text.slice(end, end + 14);

    if (/[:/]\s?$/.test(before) && !/^\s?\/[-=]/.test(m[2] ?? '')) continue; // 12:30, 12/05
    if (/^\s?[:/]\d/.test(after)) continue;
    const digits = m[1].replace(/\D/g, '');
    if (!/[.,' \u00A0\u202F]/.test(m[1]) && digits.length > 7) continue; // barcode, phone
    if (/^0\d/.test(m[1]) && !/[.,]/.test(m[1])) continue; // product codes like 0123

    if (/^\s*%/.test(after)) continue; // 20%, 3.5% fat
    const nearMarker = hasMarkerNear(before, after);
    const isPerUnit = PER_UNIT.test(after) || /\bper\b/i.test(after.slice(0, 6));
    if (UNIT_AFTER.test(after) && !isPerUnit) {
      if (!nearMarker) continue; // "2KG", "500 ml"
    }
    const amount = parseAmount(raw);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    hits.push({
      raw,
      amount,
      kind: isPerUnit ? 'unit' : 'price',
      hasMarker: nearMarker || (lineHasMarker && !!m[2]) || (lineHasMarker && hitsCountGuess(text) === 1),
      hasDecimals: /[.,]\d{1,2}$/.test(m[1]) || /^\d{1,3} \d{2}$/.test(m[1]),
    });
  }
  return hits;
}

function hitsCountGuess(text: string): number {
  return [...text.matchAll(NUMBER_RE)].length;
}

function hasMarkerNear(before: string, after: string): boolean {
  const b = findMarkers(`${before}0`);
  const a = findMarkers(`0${after.slice(0, 6)}`);
  return b.iso.length + b.markers.length + a.iso.length + a.markers.length > 0;
}

/**
 * Picks the price on a tag from recognised lines.
 * The biggest printed number wins, with a boost for a currency marker or cents and
 * for being near the middle of the frame; unit prices and "was" prices are pushed down.
 */
export function readPrices(
  lines: readonly OcrLine[],
  frame?: { width: number; height: number },
): PriceReading {
  if (lines.length === 0) return { others: [] };
  const maxH = Math.max(...lines.map((l) => l.height), 1);
  const cx = frame ? frame.width / 2 : 0;
  const cy = frame ? frame.height / 2 : 0;
  const diag = frame ? Math.hypot(frame.width, frame.height) / 2 : 1;

  const all: PriceCandidate[] = [];
  lines.forEach((line, i) => {
    // A "WAS" label printed on its own line just above also marks this as the old price.
    const above = lines[i - 1]?.text ?? '';
    const labelAbove = OLD_PRICE.test(above) && findPricesInLine(above).length === 0;
    for (const hit of findPricesInLine(line.text)) {
      let score = (line.height / maxH) * 4;
      if (hit.hasMarker) score += 2;
      if (hit.hasDecimals) score += 0.4;
      if (frame) {
        const dist = Math.hypot(line.x + line.width / 2 - cx, line.y + line.height / 2 - cy);
        score += (1 - Math.min(dist / diag, 1)) * 1;
      }
      if (hit.kind === 'unit') score -= 3;
      if (OLD_PRICE.test(line.text) || labelAbove) score -= 2;
      all.push({
        amount: hit.amount,
        raw: hit.raw,
        lineText: line.text,
        kind: hit.kind,
        hasMarker: hit.hasMarker,
        score,
        box: { x: line.x, y: line.y, width: line.width, height: line.height },
      });
    }
  });

  all.sort((a, b) => b.score - a.score);
  const primary = all.find((c) => c.kind === 'price') ?? all[0];
  const others = all.filter((c) => c !== primary && !(c.amount === primary?.amount && c.kind === primary?.kind));
  return { primary, others };
}
