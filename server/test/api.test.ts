import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, refreshRates, sendReminders } from '../src/app';
import { normaliseKey, newFriendKey, signToken, verifyToken } from '../src/crypto';
import { testEnv } from './fakes';
import type { Env } from '../src/env';

const DAY = 86_400_000;
type Sent = { to: string[]; subject: string; text: string };

let env: Env;
let sent: Sent[];
let rcPlan: { share: boolean; active: boolean; expires: number };

beforeEach(() => {
  env = testEnv();
  sent = [];
  rcPlan = { share: true, active: true, expires: Date.now() + 30 * DAY };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
      const exp = new Date(rcPlan.active ? rcPlan.expires : Date.now() - DAY).toISOString();
      const ents: Record<string, object> = { tagio: { expires_date: exp, product_identifier: rcPlan.share ? 'tagio_share_monthly' : 'tagio_solo_monthly' } };
      if (rcPlan.share) ents.share = ents.tagio;
      return Response.json({ subscriber: { original_app_user_id: 'rc_1', entitlements: ents, subscriptions: { tagio_share_monthly: { expires_date: exp, unsubscribe_detected_at: null } } } });
    }
    if (url === 'https://api.resend.com/emails') {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'mail' });
    }
    if (url === 'https://rates.test/latest/USD') {
      const rates: Record<string, number> = { USD: 1, KES: 129.98 };
      for (let i = 0; i < 120; i++) rates[`X${i.toString().padStart(2, '0')}`] = i + 1;
      return Response.json({ result: 'success', time_last_update_utc: 'Fri, 20 Nov 2026 00:02:32 +0000', rates });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

const call = (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  app.request(
    path,
    { method: init.method ?? 'POST', body: init.body ? JSON.stringify(init.body) : undefined, headers: { 'Content-Type': 'application/json', ...init.headers } },
    env,
  );

async function verifiedOwner() {
  expect((await call('/v1/owner/email/start', { body: { appUserId: 'rc_1', email: 'Amina@Example.com' } })).status).toBe(200);
  const code = /(\d{6})/.exec(sent.at(-1)!.subject)![1];
  const res = await call('/v1/owner/email/verify', { body: { appUserId: 'rc_1', code } });
  expect(res.status).toBe(200);
  return (await res.json()) as { ownerToken: string; access: { slots: { key: string; slotNo: number; inUse: boolean }[]; email: string } };
}

describe('crypto', () => {
  it('makes keys in the right shape and normalises input', () => {
    const k = newFriendKey();
    expect(k).toMatch(/^TAG-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normaliseKey(k.toLowerCase().replace(/-/g, ' '))).toBe(k);
    expect(normaliseKey('TAG-0000-1111')).toBeNull();
    expect(normaliseKey('nope')).toBeNull();
  });
  it('signs and rejects tampered or expired tokens', async () => {
    const t = await signToken({ t: 'owner', sub: 's1', exp: Date.now() + 1000 }, 'k');
    expect(await verifyToken(t, 'k')).toMatchObject({ sub: 's1' });
    expect(await verifyToken(t, 'other')).toBeNull();
    expect(await verifyToken(t.slice(0, -2) + 'xx', 'k')).toBeNull();
    const old = await signToken({ t: 'owner', sub: 's1', exp: Date.now() - 1000 }, 'k');
    expect(await verifyToken(old, 'k')).toBeNull();
    expect(await verifyToken(old, 'k', Date.now(), 5000)).not.toBeNull();
  });
});

describe('owner email', () => {
  it('refuses users without a subscription', async () => {
    rcPlan.active = false;
    const res = await call('/v1/owner/email/start', { body: { appUserId: 'rc_1', email: 'a@b.co' } });
    expect(res.status).toBe(402);
  });
  it('rejects a wrong code and locks after five tries', async () => {
    await call('/v1/owner/email/start', { body: { appUserId: 'rc_1', email: 'a@b.co' } });
    for (let i = 0; i < 5; i++) expect((await call('/v1/owner/email/verify', { body: { appUserId: 'rc_1', code: '000000' } })).status).toBe(400);
    expect((await call('/v1/owner/email/verify', { body: { appUserId: 'rc_1', code: '000000' } })).status).toBe(429);
  });
  it('verifies, creates two friend keys and emails them', async () => {
    const { ownerToken, access } = await verifiedOwner();
    expect(ownerToken).toBeTruthy();
    expect(access.email).toBe('amina@example.com');
    expect(access.slots).toHaveLength(2);
    expect(sent.at(-1)!.subject).toBe('Your Tagio friend keys');
    expect(sent.at(-1)!.text).toContain(access.slots[0].key);
  });
  it('gives Solo subscribers no friend keys', async () => {
    rcPlan.share = false;
    const { access } = await verifiedOwner();
    expect(access.slots).toHaveLength(0);
  });
});

describe('friend keys', () => {
  it('redeems, refuses a second phone, refreshes, and dies when replaced', async () => {
    const { ownerToken, access } = await verifiedOwner();
    const key = access.slots[0].key;

    const r1 = await call('/v1/keys/redeem', { body: { key: key.toLowerCase(), deviceId: 'dev-A' } });
    expect(r1.status).toBe(200);
    const { token, expiresAt } = (await r1.json()) as { token: string; expiresAt: number };
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 72 * 3_600_000);
    expect(sent.some((m) => m.subject === 'Friend key 1 is now in use')).toBe(true);

    expect((await call('/v1/keys/redeem', { body: { key, deviceId: 'dev-A' } })).status).toBe(200);
    expect((await call('/v1/keys/redeem', { body: { key, deviceId: 'dev-B' } })).status).toBe(409);

    expect((await call('/v1/keys/refresh', { body: { token, deviceId: 'dev-A' } })).status).toBe(200);
    expect((await call('/v1/keys/refresh', { body: { token, deviceId: 'dev-B' } })).status).toBe(401);

    const view = await call('/v1/owner/access', { method: 'GET', headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(((await view.json()) as { slots: { inUse: boolean }[] }).slots[0].inUse).toBe(true);

    const rep = await call('/v1/owner/slots/1/replace', { headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(rep.status).toBe(200);
    const newKey = ((await rep.json()) as { slots: { key: string }[] }).slots[0].key;
    expect(newKey).not.toBe(key);
    expect((await call('/v1/keys/redeem', { body: { key, deviceId: 'dev-A' } })).status).toBe(404);
    expect((await call('/v1/keys/refresh', { body: { token, deviceId: 'dev-A' } })).status).toBe(403);
    expect((await call('/v1/keys/redeem', { body: { key: newKey, deviceId: 'dev-B' } })).status).toBe(200);
  });

  it('owner routes need an owner token', async () => {
    expect((await call('/v1/owner/access', { method: 'GET' })).status).toBe(401);
  });

  it('rejects malformed keys and unknown keys', async () => {
    expect((await call('/v1/keys/redeem', { body: { key: 'hello', deviceId: 'd' } })).status).toBe(400);
    expect((await call('/v1/keys/redeem', { body: { key: 'TAG-2222-3333', deviceId: 'd' } })).status).toBe(404);
  });
});

describe('RevenueCat webhook', () => {
  const hook = (event: object, auth = 'Bearer hook-secret') => call('/webhooks/revenuecat', { body: { event }, headers: { Authorization: auth } });

  it('checks the auth header', async () => {
    expect((await hook({ type: 'TEST', id: 'e0', app_user_id: 'rc_1' }, 'Bearer wrong')).status).toBe(401);
  });

  it('pauses friend keys on expiry and resumes on renewal, emailing each time', async () => {
    const { access } = await verifiedOwner();
    const key = access.slots[1].key;
    await hook({ type: 'EXPIRATION', id: 'e1', app_user_id: 'rc_1', entitlement_ids: ['tagio', 'share'] });
    expect(sent.at(-1)!.subject).toBe('Your Tagio plan has ended');
    expect((await call('/v1/keys/redeem', { body: { key, deviceId: 'dev-C' } })).status).toBe(403);

    await hook({ type: 'RENEWAL', id: 'e2', app_user_id: 'rc_1', entitlement_ids: ['tagio', 'share'], expiration_at_ms: Date.now() + 30 * DAY, price: 4.99, currency: 'USD', store: 'APP_STORE' });
    expect(sent.at(-1)!.subject).toMatch(/^Tagio receipt/);
    expect(sent.at(-1)!.text).toContain('4.99 USD');
    expect((await call('/v1/keys/redeem', { body: { key, deviceId: 'dev-C' } })).status).toBe(200);
  });

  it('ignores a repeated event', async () => {
    await verifiedOwner();
    const ev = { type: 'CANCELLATION', id: 'dup', app_user_id: 'rc_1' };
    await hook(ev);
    const count = sent.length;
    const res = await hook(ev);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(sent.length).toBe(count);
  });
});

describe('scheduled jobs', () => {
  it('publishes rates', async () => {
    expect((await call('/v1/rates', { method: 'GET' })).status).toBe(503);
    await refreshRates(env);
    const res = await call('/v1/rates', { method: 'GET' });
    const data = (await res.json()) as { perUsd: Record<string, number>; updatedAt: string };
    expect(data.perUsd.KES).toBe(129.98);
    expect(data.updatedAt).toBe('2026-11-20T00:02:32.000Z');
  });

  it('sends one renewal reminder three days ahead', async () => {
    rcPlan.expires = Date.now() + 3 * DAY;
    await verifiedOwner();
    expect(await sendReminders(env)).toBe(1);
    expect(sent.at(-1)!.subject).toMatch(/^Tagio renews on/);
    expect(await sendReminders(env)).toBe(0);
  });
});
