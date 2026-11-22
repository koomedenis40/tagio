import { describe, expect, it } from 'vitest';
import { parseAmount, readPrices, findPricesInLine, type OcrLine } from '../price';
import { detectCurrency } from '../detect';
import { convert, formatAmount, formatMoney, rateLabel, type Rates } from '../money';
import { CURRENCIES, flagEmoji, localCurrencyFor, searchCurrencies } from '../currencies';
import { PriceLocker } from '../locker';

describe('parseAmount', () => {
  const cases: [string, number][] = [
    ['450', 450],
    ['450/-', 450],
    ['450/=', 450],
    ['1,299.00', 1299],
    ['1.299,00', 1299],
    ['1 299,50', 1299.5],
    ["1'299.50", 1299.5],
    ['3,49', 3.49],
    ['3.49', 3.49],
    ['12.5', 12.5],
    ['1,299', 1299],
    ['1.299', 1299],
    ['12,345,678', 12345678],
    ['4 99', 4.99],
    ['0.99', 0.99],
  ];
  it.each(cases)('%s -> %d', (raw, value) => {
    expect(parseAmount(raw)).toBeCloseTo(value, 6);
  });
});

describe('findPricesInLine', () => {
  const amounts = (t: string) => findPricesInLine(t).map((h) => h.amount);
  it('reads shilling prices', () => expect(amounts('KSh 450')).toEqual([450]));
  it('reads /- prices', () => expect(amounts('450/-')).toEqual([450]));
  it('skips weights without a marker', () => expect(amounts('UNGA FLOUR 2KG')).toEqual([]));
  it('skips volume and percentages', () => expect(amounts('Milk 500 ml 3.5% fat')).toEqual([]));
  it('skips dates and times', () => expect(amounts('Best before 12/05/2027 10:30')).toEqual([]));
  it('skips barcodes', () => expect(amounts('6161101560012')).toEqual([]));
  it('marks unit prices', () => {
    const hits = findPricesInLine('KSh 225/kg');
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('unit');
  });
  it('marks per-litre prices', () => expect(findPricesInLine('€2,10 per l')[0].kind).toBe('unit'));
  it('reads euro with comma decimals', () => expect(amounts('€3,49')).toEqual([3.49]));
  it('reads symbol after number', () => expect(amounts('12,90 €')).toEqual([12.9]));
  it('reads ISO code prices', () => expect(amounts('USD 1,299.00')).toEqual([1299]));
});

const line = (text: string, height: number, y = 100): OcrLine => ({ text, x: 50, y, width: 200, height });

describe('readPrices', () => {
  it('picks the big price over the unit price', () => {
    const r = readPrices([line('UNGA FLOUR 2KG', 10, 50), line('KSh 450', 40, 80), line('KSh 225/kg', 9, 130)]);
    expect(r.primary?.amount).toBe(450);
    expect(r.others.map((o) => o.amount)).toContain(225);
  });
  it('prefers a marked price over a bigger bare number', () => {
    const r = readPrices([line('Aisle 12', 30), line('$4.99', 28)]);
    expect(r.primary?.amount).toBe(4.99);
  });
  it('pushes down a "was" price', () => {
    const r = readPrices([line('WAS €5,99', 30, 40), line('€3,99', 30, 90)]);
    expect(r.primary?.amount).toBe(3.99);
  });
  it('returns nothing when there is no price', () => {
    expect(readPrices([line('Fresh bananas', 20)]).primary).toBeUndefined();
  });
});

describe('detectCurrency', () => {
  it('reads KSh as Kenyan shilling', () => expect(detectCurrency('KSh 450').code).toBe('KES'));
  it('uses region for /- tags', () => {
    expect(detectCurrency('450/-', { region: 'TZ' }).code).toBe('TZS');
    expect(detectCurrency('450/-', { region: 'KE' }).code).toBe('KES');
  });
  it('settles $ by region', () => {
    expect(detectCurrency('$4.99', { region: 'CA' })).toMatchObject({ code: 'CAD', confidence: 'high' });
    expect(detectCurrency('$4.99', { region: 'US' }).code).toBe('USD');
  });
  it('falls back to last confirmed for a shared symbol abroad', () => {
    expect(detectCurrency('$4.99', { region: 'KE', last: 'AUD' })).toMatchObject({ code: 'AUD', confidence: 'medium' });
  });
  it('marks unknown shared symbol as low confidence', () => {
    expect(detectCurrency('$4.99', { region: 'KE' })).toMatchObject({ code: 'USD', confidence: 'low' });
  });
  it('trusts an ISO code', () => expect(detectCurrency('UGX 12,000', { region: 'KE' }).code).toBe('UGX'));
  it('ignores ISO-looking words not next to a number', () => {
    expect(detectCurrency('ALL NATURAL TOP CUP 3.49', { region: 'GB' }).code).toBe('GBP');
  });
  it('reads euro and pound symbols', () => {
    expect(detectCurrency('€3,49').code).toBe('EUR');
    expect(detectCurrency('£2.50', { region: 'GB' }).code).toBe('GBP');
  });
  it('reads kr by region', () => expect(detectCurrency('29,90 kr', { region: 'NO' }).code).toBe('NOK'));
  it('reads R as rand', () => expect(detectCurrency('R12.99', { region: 'ZA' }).code).toBe('ZAR'));
  it('uses region with no marker', () => {
    expect(detectCurrency('12.99', { region: 'DE' })).toMatchObject({ code: 'EUR', reason: 'region' });
  });
});

describe('money', () => {
  const rates: Rates = { perUsd: { USD: 1, KES: 129.983881, EUR: 0.910749, JPY: 159.74951 }, updatedAt: '2026-11-20' };
  it('converts through USD', () => expect(convert(450, 'KES', 'USD', rates)).toBeCloseTo(3.462, 3));
  it('handles unknown currency', () => expect(convert(1, 'KES', 'XXX', rates)).toBeUndefined());
  it('labels the rate', () => expect(rateLabel('KES', 'USD', rates)).toBe('1 USD = 129.98 KES'));
  it('formats money', () => {
    expect(formatMoney(3.462, 'USD')).toBe('$3.46');
    expect(formatMoney(3.462, 'USD', 'whole')).toBe('$3');
    expect(formatAmount(1446.371, 'KWD')).toBe('1,446.371');
    expect(formatAmount(2.817, 'JPY')).toBe('3');
    expect(formatAmount(450, 'KES')).toBe('450');
  });
});

describe('currencies', () => {
  it('has the full list', () => expect(CURRENCIES.length).toBe(153));
  it('makes flags', () => expect(flagEmoji('KE')).toBe('🇰🇪'));
  it('knows local currencies', () => {
    expect(localCurrencyFor('KE')).toBe('KES');
    expect(localCurrencyFor('FR')).toBe('EUR');
    expect(localCurrencyFor('SN')).toBe('XOF');
    expect(localCurrencyFor('EC')).toBe('USD');
  });
  it('searches by name and code', () => {
    expect(searchCurrencies('shilling').map((c) => c.code)).toEqual(expect.arrayContaining(['KES', 'UGX', 'TZS']));
    expect(searchCurrencies('kes')[0].code).toBe('KES');
  });
});

describe('PriceLocker', () => {
  const cand = (amount: number) => ({ amount, raw: String(amount), lineText: '', kind: 'price' as const, hasMarker: true, score: 1, box: { x: 0, y: 0, width: 0, height: 0 } });
  it('locks after two matching reads and holds through one bad read', () => {
    const l = new PriceLocker();
    expect(l.feed(cand(450)).phase).toBe('searching');
    expect(l.feed(cand(450)).phase).toBe('locked');
    expect(l.feed(cand(45)).phase).toBe('locked');
    expect(l.feed(cand(450)).phase).toBe('locked');
  });
  it('switches to a new price once confirmed and releases after misses', () => {
    const l = new PriceLocker(2, 3);
    l.feed(cand(450)); l.feed(cand(450));
    l.feed(cand(99)); const s = l.feed(cand(99));
    expect(s.phase === 'locked' && s.candidate.amount).toBe(99);
    l.feed(undefined); l.feed(undefined);
    expect(l.feed(undefined).phase).toBe('searching');
  });
});

import { formatKeyInput, isCompleteKey } from '../keys';
describe('friend key input', () => {
  it('formats as you type', () => {
    expect(formatKeyInput('t')).toBe('T');
    expect(formatKeyInput('tag7kq2')).toBe('TAG-7KQ2');
    expect(formatKeyInput('tag7kq2m9px')).toBe('TAG-7KQ2-M9PX');
    expect(formatKeyInput('7KQ2 M9PX')).toBe('TAG-7KQ2-M9PX');
    expect(formatKeyInput('TAG-7KQ2-M9PXZZZ')).toBe('TAG-7KQ2-M9PX');
  });
  it('lets you delete back through the prefix', () => {
    expect(formatKeyInput('TAG')).toBe('TAG');
    expect(formatKeyInput('TA')).toBe('TA');
    expect(formatKeyInput('')).toBe('');
  });
  it('checks completeness and alphabet', () => {
    expect(isCompleteKey('TAG-7KQ2-M9PX')).toBe(true);
    expect(isCompleteKey('TAG-7KQ2-M9P')).toBe(false);
    expect(isCompleteKey('TAG-0KQ2-M9PX')).toBe(false);
  });
});
