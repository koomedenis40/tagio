import { isKnownCurrency, localCurrencyFor } from './currencies';

export type Confidence = 'high' | 'medium' | 'low';

export type Detection = {
  code: string;
  confidence: Confidence;
  /** What decided it, for the UI hint ("Read KSh on the tag"). */
  reason: 'iso-code' | 'symbol' | 'symbol+region' | 'symbol+last' | 'region' | 'last' | 'fallback';
  marker?: string;
};

/**
 * Markers that can appear on a price tag, longest first so "US$" wins over "$".
 * Each maps to the currencies it can mean; the first is the default.
 */
const MARKERS: readonly (readonly [string, readonly string[]])[] = [
  ['US$', ['USD']], ['CA$', ['CAD']], ['AU$', ['AUD']], ['NZ$', ['NZD']], ['HK$', ['HKD']],
  ['MX$', ['MXN']], ['NT$', ['TWD']], ['GH₵', ['GHS']], ['FCFA', ['XAF', 'XOF']], ['KSHS', ['KES']],
  ['KSH', ['KES']], ['TSH', ['TZS']], ['USH', ['UGX']], ['FRW', ['RWF']], ['CFA', ['XOF', 'XAF']],
  ['C$', ['CAD', 'NIO']], ['A$', ['AUD']], ['S$', ['SGD']], ['R$', ['BRL']], ['E£', ['EGP']],
  ['ZŁ', ['PLN']], ['KČ', ['CZK']], ['LEI', ['RON']], ['CHF', ['CHF']], ['FR.', ['CHF']],
  ['RM', ['MYR']], ['RP', ['IDR']], ['DHS', ['AED']], ['DH', ['AED', 'MAD']], ['QR', ['QAR']],
  ['SR', ['SAR']], ['RS', ['INR', 'PKR', 'LKR', 'NPR', 'MUR', 'SCR']], ['KR', ['SEK', 'NOK', 'DKK', 'ISK']],
  ['FT', ['HUF']], ['BR', ['ETB', 'BYN']], ['MT', ['MZN']], ['LE', ['SLE']], ['SH', ['KES', 'UGX', 'TZS', 'SOS']],
  ['RF', ['RWF']], ['€', ['EUR']], ['£', ['GBP', 'EGP', 'GIP', 'FKP', 'SHP']], ['¥', ['JPY', 'CNY']],
  ['₹', ['INR']], ['₦', ['NGN']], ['₵', ['GHS']], ['₱', ['PHP']], ['₩', ['KRW']], ['₫', ['VND']],
  ['₺', ['TRY']], ['₴', ['UAH']], ['₸', ['KZT']], ['₪', ['ILS']], ['฿', ['THB']], ['₽', ['RUB']],
  ['₼', ['AZN']], ['₾', ['GEL']], ['৳', ['BDT']], ['₮', ['MNT']], ['₲', ['PYG']], ['₡', ['CRC']],
  ['₭', ['LAK']], ['$', ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'ARS', 'CLP', 'COP', 'JMD', 'TTD', 'BSD', 'BBD', 'LRD', 'NAD', 'FJD']],
  ['R', ['ZAR']], ['/-', ['KES', 'UGX', 'TZS']], ['/=', ['KES', 'UGX', 'TZS']],
];

/** Single letters and short words only count right next to a number. */
const NEEDS_NUMBER = new Set(['R', 'RS', 'KR', 'SH', 'BR', 'MT', 'LE', 'RF', 'FT', 'DH', 'QR', 'SR', 'RM', 'RP']);

export type MarkerHit = { marker: string; candidates: readonly string[] };

// An ISO code only counts next to a number, so words like "ALL", "TOP" or "CUP" on a tag don't.
// Codes that are also everyday words on packaging only count where that currency is local.
const WORDLIKE = new Set(['ALL', 'BAM', 'BOB', 'CUP', 'GEL', 'MAD', 'MOP', 'PEN', 'SOS', 'TOP', 'TRY']);

const ISO_RE = /(?:^|[^A-Z])([A-Z]{3})\.?\s?(?=\d)|\d\s?([A-Z]{3})(?=[^A-Z]|$)/g;

/** Finds currency markers in a piece of tag text (normally the price line). */
export function findMarkers(text: string): { iso: string[]; markers: MarkerHit[] } {
  const upper = text.toUpperCase();
  const iso: string[] = [];
  for (const m of upper.matchAll(ISO_RE)) {
    const code = m[1] ?? m[2];
    if (code && isKnownCurrency(code) && !iso.includes(code)) iso.push(code);
  }
  const markers: MarkerHit[] = [];
  let rest = upper;
  for (const [marker, candidates] of MARKERS) {
    const idx = findMarker(rest, marker);
    if (idx >= 0) {
      markers.push({ marker, candidates });
      rest = rest.slice(0, idx) + ' '.repeat(marker.length) + rest.slice(idx + marker.length);
    }
  }
  return { iso, markers };
}

function findMarker(text: string, marker: string): number {
  if (!NEEDS_NUMBER.has(marker) && !/^[A-Z]+$/.test(marker)) return text.indexOf(marker);
  // Letter markers must stand alone and sit next to a digit: "KSh 450", "450 kr", "R12.99".
  const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^A-Z])${esc}\\.?(?=\\s?\\d)|\\d\\s?${esc}(?=[^A-Z]|$)`);
  const m = re.exec(text);
  if (!m) return -1;
  return m.index + m[0].indexOf(marker);
}

/**
 * Works out the currency on a tag.
 * Order: ISO code on the tag, then a symbol (settled by the phone's region or the last
 * confirmed currency when it is shared), then the region alone, then the last confirmed one.
 */
export function detectCurrency(
  text: string,
  opts: { region?: string | null; last?: string | null } = {},
): Detection {
  const local = localCurrencyFor(opts.region);
  const last = opts.last ?? undefined;
  const found = findMarkers(text);
  const markers = found.markers;
  const iso = found.iso.filter((c) => !WORDLIKE.has(c) || c === local);

  if (iso.length > 0) {
    const pick = iso.find((c) => c === local) ?? iso[0];
    return { code: pick, confidence: 'high', reason: 'iso-code', marker: pick };
  }

  if (markers.length > 0) {
    const hit = markers[0];
    if (hit.candidates.length === 1) {
      return { code: hit.candidates[0], confidence: 'high', reason: 'symbol', marker: hit.marker };
    }
    if (local && hit.candidates.includes(local)) {
      return { code: local, confidence: 'high', reason: 'symbol+region', marker: hit.marker };
    }
    if (last && hit.candidates.includes(last)) {
      return { code: last, confidence: 'medium', reason: 'symbol+last', marker: hit.marker };
    }
    return { code: hit.candidates[0], confidence: 'low', reason: 'symbol', marker: hit.marker };
  }

  if (local) return { code: local, confidence: 'medium', reason: 'region' };
  if (last) return { code: last, confidence: 'medium', reason: 'last' };
  return { code: 'USD', confidence: 'low', reason: 'fallback' };
}
