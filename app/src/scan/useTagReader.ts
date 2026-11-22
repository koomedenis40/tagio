import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { Text as OcrText } from 'react-native-vision-camera-ocr-plus';
import { readPrices, type OcrLine, type PriceCandidate } from '../core/price';
import { detectCurrency, type Detection } from '../core/detect';
import { PriceLocker } from '../core/locker';

export type TagReading = {
  phase: 'searching' | 'locked';
  price?: PriceCandidate;
  /** Second prices on the tag (per kg, per litre) at the moment of locking. */
  extras: PriceCandidate[];
  detection?: Detection;
};

type Options = {
  mode: 'auto' | string;
  region: string | null;
  last: string | null;
  onConfident?: (code: string) => void;
};

const SAMPLE_MS = 250;

export function linesFrom(text: OcrText): OcrLine[] {
  const out: OcrLine[] = [];
  for (const block of text.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const f = line.lineFrame;
      if (!line.lineText?.trim() || !f) continue;
      out.push({ text: line.lineText, x: f.x, y: f.y, width: f.width, height: f.height });
    }
  }
  return out;
}

/**
 * Turns the stream of on-device OCR results into one steady reading.
 * Nothing is stored: each result is parsed and dropped.
 */
export function useTagReader({ mode, region, last, onConfident }: Options) {
  const locker = useRef(new PriceLocker(2, 6)).current;
  const [reading, setReading] = useState<TagReading>({ phase: 'searching', extras: [] });
  const opts = useRef({ mode, region, last, onConfident });
  opts.current = { mode, region, last, onConfident };
  const lockedKey = useRef<string | null>(null);
  const lastSample = useRef(0);

  const detect = useCallback((price: PriceCandidate, allText: string): Detection => {
    const { mode: m, region: r, last: l } = opts.current;
    if (m !== 'auto') return { code: m, confidence: 'high', reason: 'iso-code' };
    const onLine = detectCurrency(price.lineText, { region: r, last: l });
    if (onLine.reason !== 'region' && onLine.reason !== 'last' && onLine.reason !== 'fallback') return onLine;
    return detectCurrency(allText, { region: r, last: l }); // marker printed on its own line
  }, []);

  const onText = useCallback((text: OcrText) => {
    // The camera repeats the last OCR result on skipped frames (about 30 a second).
    // Sampling every 250 ms means each sample is very likely a fresh read.
    const now = Date.now();
    if (now - lastSample.current < SAMPLE_MS) return;
    lastSample.current = now;
    const lines = linesFrom(text);
    const { primary, others } = readPrices(lines);
    const state = locker.feed(primary);
    if (state.phase === 'searching') {
      if (lockedKey.current !== null) {
        lockedKey.current = null;
        setReading({ phase: 'searching', extras: [] });
      }
      return;
    }
    const key = `${state.candidate.amount}|${state.candidate.lineText}`;
    if (key === lockedKey.current) return;
    lockedKey.current = key;
    const detection = detect(state.candidate, lines.map((l) => l.text).join(' '));
    if (detection.confidence === 'high' && opts.current.mode === 'auto') opts.current.onConfident?.(detection.code);
    Haptics.selectionAsync().catch(() => {});
    setReading({ phase: 'locked', price: state.candidate, extras: others.filter((o) => o.kind === 'unit').slice(0, 1), detection });
  }, [detect, locker]);

  // A manual change of tag currency re-labels the current reading straight away.
  useEffect(() => {
    setReading((r) => (r.price ? { ...r, detection: detect(r.price, r.price.lineText) } : r));
  }, [mode, detect]);

  const rescan = useCallback(() => {
    locker.reset();
    lockedKey.current = null;
    setReading({ phase: 'searching', extras: [] });
  }, [locker]);

  return { reading, onText, rescan };
}
