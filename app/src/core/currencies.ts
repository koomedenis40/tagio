import { CURRENCY_ROWS } from './currencyData';

export type Currency = {
  code: string;
  name: string;
  /** ISO 3166 region used to draw the flag (EU for the euro, CM for XAF, ...). */
  flagRegion: string;
  flag: string;
};

/** Turns a two-letter region code into its flag emoji (EU works on iOS and Android). */
export function flagEmoji(region: string): string {
  const base = 0x1f1e6;
  const r = region.toUpperCase();
  if (!/^[A-Z]{2}$/.test(r)) return '';
  return String.fromCodePoint(base + r.charCodeAt(0) - 65, base + r.charCodeAt(1) - 65);
}

export const CURRENCIES: readonly Currency[] = CURRENCY_ROWS.map(([code, name, flagRegion]) => ({
  code,
  name,
  flagRegion,
  flag: flagEmoji(flagRegion),
}));

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** Case-insensitive search over code and name. Empty query returns everything. */
export function searchCurrencies(query: string, list: readonly Currency[] = CURRENCIES): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  const starts: Currency[] = [];
  const contains: Currency[] = [];
  for (const c of list) {
    const code = c.code.toLowerCase();
    const name = c.name.toLowerCase();
    if (code === q || code.startsWith(q) || name.startsWith(q)) starts.push(c);
    else if (code.includes(q) || name.includes(q)) contains.push(c);
  }
  return [...starts, ...contains];
}

const EUROZONE = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK'.split(' ');
const XAF = 'CM CF TD CG GQ GA'.split(' ');
const XOF = 'BJ BF CI GW ML NE SN TG'.split(' ');
const XCD = 'AG DM GD KN LC VC AI MS'.split(' ');
const USD = 'US EC SV TL FM MH PW PR VG TC BQ ZW'.split(' ');
const OTHER: Record<string, string> = {
  GB: 'GBP', CH: 'CHF', LI: 'CHF', DK: 'DKK', GL: 'DKK', FO: 'DKK', NO: 'NOK', SE: 'SEK',
  AU: 'AUD', NZ: 'NZD', CW: 'XCG', SX: 'XCG', PF: 'XPF', NC: 'XPF', WF: 'XPF', PS: 'ILS',
  LS: 'LSL', NA: 'NAD', SZ: 'SZL', BT: 'BTN',
};

/** The currency people normally pay in, in a region (ISO 3166 alpha-2). */
export function localCurrencyFor(region: string | null | undefined): string | undefined {
  if (!region) return undefined;
  const r = region.toUpperCase();
  if (EUROZONE.includes(r)) return 'EUR';
  if (XAF.includes(r)) return 'XAF';
  if (XOF.includes(r)) return 'XOF';
  if (XCD.includes(r)) return 'XCD';
  if (USD.includes(r)) return 'USD';
  if (OTHER[r]) return OTHER[r];
  const guess = CURRENCIES.find((c) => c.code.startsWith(r));
  return guess?.code;
}
