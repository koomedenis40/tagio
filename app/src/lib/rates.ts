import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { prefs } from './storage';
import { config } from '../config';
import { FALLBACK_RATES } from '../core/fallbackRates';
import type { Rates } from '../core/money';

type Cached = Rates & { fetchedAt: number };

let memory: Cached | undefined;
const listeners = new Set<(r: Cached) => void>();

async function load(): Promise<Cached> {
  if (memory) return memory;
  memory = (await prefs.get<Cached>('rates')) ?? { ...FALLBACK_RATES, fetchedAt: 0 };
  return memory;
}

/** Downloads the one public rates file. The server never learns which currencies you use. */
export async function refreshRates(force = false): Promise<Cached> {
  const current = await load();
  if (!force && Date.now() - current.fetchedAt < config.ratesMaxAgeMs) return current;
  try {
    const fresh = await api.rates();
    if (fresh.perUsd?.USD === 1) {
      memory = { perUsd: fresh.perUsd, updatedAt: fresh.updatedAt, fetchedAt: Date.now() };
      await prefs.set('rates', memory);
      listeners.forEach((l) => l(memory!));
    }
  } catch {
    // Offline: keep converting with what we have.
  }
  return memory ?? current;
}

/** Current rates, refreshed when the app comes to the foreground. */
export function useRates(): Cached {
  const [rates, setRates] = useState<Cached>(memory ?? { ...FALLBACK_RATES, fetchedAt: 0 });
  useEffect(() => {
    listeners.add(setRates);
    load().then(setRates).then(() => refreshRates());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshRates();
    });
    return () => {
      listeners.delete(setRates);
      sub.remove();
    };
  }, []);
  return rates;
}

/** "14:02 today", "yesterday", "20 Nov". */
export function ratesAge(updatedAt: string, now = new Date()): string {
  const d = new Date(updatedAt);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
