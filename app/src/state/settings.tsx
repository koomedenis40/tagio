import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Localization from 'expo-localization';
import { prefs } from '../lib/storage';
import { localCurrencyFor } from '../core/currencies';
import type { Rounding } from '../core/money';

export type Settings = {
  /** The currency prices are shown in. */
  to: string;
  /** 'auto' reads the currency off each tag; otherwise every tag is treated as this code. */
  from: 'auto' | string;
  rounding: Rounding;
  /** Last tag currency the user confirmed or that was read with high confidence. */
  lastConfirmed: string | null;
  onboarded: boolean;
};

type Ctx = Settings & {
  ready: boolean;
  region: string | null;
  update: (patch: Partial<Settings>) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

function defaults(region: string | null): Settings {
  const home = Localization.getLocales()[0]?.currencyCode ?? localCurrencyFor(region) ?? 'USD';
  return { to: home, from: 'auto', rounding: 'exact', lastConfirmed: null, onboarded: false };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Region comes from the phone's settings, never from GPS.
  const region = Localization.getLocales()[0]?.regionCode ?? null;
  const [state, setState] = useState<Settings>(() => defaults(region));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    prefs.get<Settings>('settings').then((saved) => {
      if (saved) setState((s) => ({ ...s, ...saved }));
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setState((s) => {
      const next = { ...s, ...patch };
      prefs.set('settings', next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...state, ready, region, update }), [state, ready, region, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
