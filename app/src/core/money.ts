export type Rates = {
  /** Units of each currency per 1 USD. */
  perUsd: Record<string, number>;
  /** When the provider last updated, ISO string. */
  updatedAt: string;
};

export type Rounding = 'exact' | 'whole';

/** Converts an amount between two currencies using USD-based rates. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | undefined {
  const f = rates.perUsd[from];
  const t = rates.perUsd[to];
  if (!f || !t) return undefined;
  return (amount / f) * t;
}

/** "1 USD = 129.98 KES" (always puts the bigger side on the right so it reads well). */
export function rateLabel(from: string, to: string, rates: Rates): string | undefined {
  const r = convert(1, from, to, rates);
  if (r === undefined) return undefined;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : 4 });
  return r >= 1 ? `1 ${from} = ${fmt(r)} ${to}` : `1 ${to} = ${fmt(1 / r)} ${from}`;
}

function fractionDigits(code: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function digitsFor(amount: number, code: string, rounding: Rounding): number {
  if (rounding === 'whole' || amount >= 10000 || Number.isInteger(amount)) return 0;
  return fractionDigits(code);
}

/** "$3.46", "KSh 450", "€1.299,00" style output with a narrow symbol where the platform has one. */
export function formatMoney(amount: number, code: string, rounding: Rounding = 'exact'): string {
  const d = digitsFor(amount, code, rounding);
  const base = { style: 'currency' as const, currency: code, minimumFractionDigits: d, maximumFractionDigits: d };
  try {
    return new Intl.NumberFormat('en-US', { ...base, currencyDisplay: 'narrowSymbol' }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat('en-US', base).format(amount);
    } catch {
      return `${code} ${amount.toFixed(d)}`;
    }
  }
}

/** The number alone, grouped, for the big readout: "3.46", "1,446.37", "6,270". */
export function formatAmount(amount: number, code: string, rounding: Rounding = 'exact'): string {
  const d = digitsFor(amount, code, rounding);
  return amount.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
