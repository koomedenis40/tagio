// Small crypto helpers on Web Crypto, so the Worker needs no extra libraries.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** No 0/O, 1/I/L: easy to read out and type. 31 symbols, about 5 bits each. */
const KEY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomId(): string {
  return crypto.randomUUID();
}

/** A friend key like TAG-7KQ2-M9PX (8 random symbols, about 39 bits). */
export function newFriendKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
  return `TAG-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Normalises what a person typed: case, spaces, dashes, look-alike letters. */
export function normaliseKey(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  const body = raw.startsWith('TAG') ? raw.slice(3) : raw;
  if (body.length !== 8 || [...body].some((c) => !KEY_ALPHABET.includes(c))) return null;
  return `TAG-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return toHex(new Uint8Array(digest));
}

function toHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export type FriendToken = { t: 'friend'; sid: string; dev: string; exp: number };
export type OwnerToken = { t: 'owner'; sub: string; exp: number };
export type Token = FriendToken | OwnerToken;

/** Compact signed token: base64url(json).base64url(hmac). */
export async function signToken(payload: Token, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** `graceMs` lets an expired token still prove who it was for (used only to refresh it). */
export async function verifyToken(token: string, secret: string, now = Date.now(), graceMs = 0): Promise<Token | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64url(body))) as Token;
    if (typeof payload.exp !== 'number' || payload.exp + graceMs < now) return null;
    return payload;
  } catch {
    return null;
  }
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(text: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return `${b64url(iv)}.${b64url(new Uint8Array(data))}`;
}

export async function decrypt(blob: string, secret: string): Promise<string> {
  const [iv, data] = blob.split('.');
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(secret), fromB64url(data));
  return dec.decode(out);
}
