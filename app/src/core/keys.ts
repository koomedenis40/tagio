export const KEY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Formats as the person types: tag7kq2m9px -> TAG-7KQ2-M9PX. Deleting back past the prefix works. */
export function formatKeyInput(text: string): string {
  const raw = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if ('TAG'.startsWith(raw)) return raw; // "", "T", "TA", "TAG" while typing or deleting
  const body = (raw.startsWith('TAG') ? raw.slice(3) : raw).slice(0, 8);
  return `TAG-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ''}`;
}

/** True when the input has all 8 symbols and every one could be in a real key. */
export function isCompleteKey(formatted: string): boolean {
  const body = formatted.replace(/^TAG-?/, '').replace(/-/g, '');
  return body.length === 8 && [...body].every((c) => KEY_ALPHABET.includes(c));
}
