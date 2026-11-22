import { Hono, type Context } from 'hono';
import type { Env } from './env';
import { DAY, HOUR } from './env';
import { allow, db, type Slot, type Subscriber } from './db';
import { decrypt, encrypt, newFriendKey, normaliseKey, randomId, sha256, signToken, sixDigitCode, verifyToken } from './crypto';
import { fetchEntitlement, type Entitlement, type RcWebhookEvent } from './revenuecat';
import { sendMail, templates } from './email';

type App = { Bindings: Env; Variables: { owner: Subscriber } };
export const app = new Hono<App>();

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const CODE_TTL = 15 * 60 * 1000;

const fail = (c: Context<App>, status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 503, error: string, extra: object = {}) =>
  c.json({ error, ...extra }, status);

async function body<T>(c: Context<App>): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

const clientIp = (c: Context<App>) => c.req.header('CF-Connecting-IP') ?? 'unknown';

/** Creates or updates the subscriber row from what RevenueCat says. */
async function syncSubscriber(env: Env, rcUserId: string, ent: Entitlement): Promise<Subscriber> {
  const now = Date.now();
  const existing = await db.subscriberByRc(env, [rcUserId]);
  const patch = {
    plan: (ent.plan ?? existing?.plan ?? 'solo') as Subscriber['plan'],
    status: (ent.active ? 'active' : 'lapsed') as Subscriber['status'],
    expires_at: ent.expiresAt,
    will_renew: ent.willRenew ? 1 : 0,
  };
  if (existing) {
    await db.updateSubscriber(env, existing.id, patch);
    return { ...existing, ...patch };
  }
  const row: Subscriber = {
    id: randomId(), rc_user_id: rcUserId, email: null, email_verified_at: null, reminder_for: null,
    created_at: now, updated_at: now, ...patch,
  };
  await db.insertSubscriber(env, row);
  return row;
}

/** Makes sure a Share subscriber has their friend slots; returns the plaintext keys of all slots. */
async function ensureSlots(env: Env, sub: Subscriber): Promise<{ slots: Slot[]; keys: string[]; created: boolean }> {
  const wanted = Number(env.FRIEND_SLOTS || 2);
  let slots = await db.slots(env, sub.id);
  let created = false;
  for (let n = slots.length + 1; n <= wanted; n++) {
    const key = newFriendKey();
    await db.insertSlot(env, {
      id: randomId(), subscriber_id: sub.id, slot_no: n, key_hash: await sha256(key), key_enc: await encrypt(key, env.KEY_ENC_SECRET),
      device_id: null, activated_at: null, moved_at: null, created_at: Date.now(),
    });
    created = true;
  }
  if (created) slots = await db.slots(env, sub.id);
  const keys = await Promise.all(slots.map((s) => decrypt(s.key_enc, env.KEY_ENC_SECRET)));
  return { slots, keys, created };
}

async function accessView(env: Env, sub: Subscriber) {
  const slots = sub.plan === 'share' ? await db.slots(env, sub.id) : [];
  return {
    plan: sub.plan,
    status: sub.status,
    expiresAt: sub.expires_at,
    willRenew: sub.will_renew === 1,
    email: sub.email_verified_at ? sub.email : null,
    slots: await Promise.all(
      slots.map(async (s) => ({
        slotNo: s.slot_no,
        key: await decrypt(s.key_enc, env.KEY_ENC_SECRET),
        inUse: !!s.device_id,
        activatedAt: s.activated_at,
      })),
    ),
  };
}

function subscriptionLive(sub: Subscriber | null, now = Date.now()): sub is Subscriber {
  return !!sub && sub.status === 'active' && (sub.expires_at === null || sub.expires_at > now);
}

async function friendToken(env: Env, slot: Slot, deviceId: string, sub: Subscriber, now = Date.now()) {
  const ttl = Number(env.TOKEN_TTL_HOURS || 72) * HOUR;
  // Never past the plan's end (plus a day for store renewal lag).
  const cap = sub.expires_at ? sub.expires_at + DAY : now + ttl;
  const exp = Math.min(now + ttl, cap);
  return { token: await signToken({ t: 'friend', sid: slot.id, dev: deviceId, exp }, env.TOKEN_SECRET), expiresAt: exp, planRenewsAt: sub.expires_at };
}

const safeMail = async (env: Env, to: string | null, mail: { subject: string; text: string }) => {
  if (!to) return;
  try {
    await sendMail(env, { to, ...mail });
  } catch (e) {
    console.error('mail failed', e);
  }
};

app.get('/health', (c) => c.json({ ok: true }));

// ---------- Owner: email and friend keys ----------

app.post('/v1/owner/email/start', async (c) => {
  const { appUserId, email } = await body<{ appUserId: string; email: string }>(c);
  if (!appUserId || appUserId.length > 200) return fail(c, 400, 'bad_user');
  const addr = email?.trim().toLowerCase();
  if (!addr || !EMAIL_RE.test(addr)) return fail(c, 400, 'bad_email');
  if (!(await allow(c.env, `start:${appUserId}`, 5, HOUR))) return fail(c, 429, 'slow_down');

  let ent: Entitlement;
  try {
    ent = await fetchEntitlement(c.env, appUserId);
  } catch {
    return fail(c, 503, 'store_unavailable');
  }
  if (!ent.active) return fail(c, 402, 'no_subscription');

  const sub = await syncSubscriber(c.env, appUserId, ent);
  const code = sixDigitCode();
  await db.putCode(c.env, sub.id, addr, await sha256(`${sub.id}:${code}`), Date.now() + CODE_TTL);
  try {
    await sendMail(c.env, { to: addr, ...templates.code(c.env, code) });
  } catch {
    return fail(c, 503, 'mail_unavailable');
  }
  return c.json({ ok: true, plan: sub.plan });
});

app.post('/v1/owner/email/verify', async (c) => {
  const { appUserId, code } = await body<{ appUserId: string; code: string }>(c);
  if (!appUserId || !code || !/^\d{6}$/.test(code)) return fail(c, 400, 'bad_code');
  const sub = await db.subscriberByRc(c.env, [appUserId]);
  if (!sub) return fail(c, 404, 'no_code');
  const row = await db.code(c.env, sub.id);
  if (!row) return fail(c, 404, 'no_code');
  if (row.expires_at < Date.now()) return fail(c, 400, 'code_expired');
  if (row.attempts >= 5) return fail(c, 429, 'too_many_attempts');
  if ((await sha256(`${sub.id}:${code}`)) !== row.code_hash) {
    await db.bumpCodeAttempts(c.env, sub.id);
    return fail(c, 400, 'wrong_code');
  }

  await db.deleteCode(c.env, sub.id);
  await db.updateSubscriber(c.env, sub.id, { email: row.email, email_verified_at: Date.now() });
  const fresh = { ...sub, email: row.email, email_verified_at: Date.now() };

  if (fresh.plan === 'share') {
    const { keys } = await ensureSlots(c.env, fresh);
    await safeMail(c.env, row.email, templates.keys(c.env, keys, fresh.expires_at));
  }
  const ownerToken = await signToken({ t: 'owner', sub: sub.id, exp: Date.now() + 365 * DAY }, c.env.TOKEN_SECRET);
  return c.json({ ownerToken, access: await accessView(c.env, fresh) });
});

app.use('/v1/owner/access', ownerAuth);
app.use('/v1/owner/slots/*', ownerAuth);

async function ownerAuth(c: Context<App>, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const payload = token ? await verifyToken(token, c.env.TOKEN_SECRET) : null;
  if (!payload || payload.t !== 'owner') return fail(c, 401, 'unauthorised');
  const sub = await db.subscriber(c.env, payload.sub);
  if (!sub) return fail(c, 401, 'unauthorised');
  c.set('owner', sub);
  await next();
}

app.get('/v1/owner/access', async (c) => {
  let sub = c.get('owner');
  try {
    sub = await syncSubscriber(c.env, sub.rc_user_id, await fetchEntitlement(c.env, sub.rc_user_id));
  } catch {
    // Store API down: show what the webhooks last told us.
  }
  if (sub.plan === 'share' && sub.email_verified_at) await ensureSlots(c.env, sub);
  return c.json(await accessView(c.env, sub));
});

app.post('/v1/owner/slots/:no/replace', async (c) => {
  const sub = c.get('owner');
  if (sub.plan !== 'share') return fail(c, 403, 'not_share_plan');
  const no = Number(c.req.param('no'));
  const target = (await db.slots(c.env, sub.id)).find((s) => s.slot_no === no);
  if (!target) return fail(c, 404, 'no_slot');
  const key = newFriendKey();
  await db.updateSlot(c.env, target.id, {
    key_hash: await sha256(key), key_enc: await encrypt(key, c.env.KEY_ENC_SECRET), device_id: null, activated_at: null, moved_at: null,
  });
  await safeMail(c.env, sub.email_verified_at ? sub.email : null, templates.newKey(c.env, no, key));
  return c.json(await accessView(c.env, sub));
});

// ---------- Friends: redeem and refresh ----------

app.post('/v1/keys/redeem', async (c) => {
  const { key, deviceId } = await body<{ key: string; deviceId: string }>(c);
  if (!deviceId || deviceId.length > 100) return fail(c, 400, 'bad_device');
  if (!(await allow(c.env, `redeem:ip:${clientIp(c)}`, 20, HOUR)) || !(await allow(c.env, `redeem:dev:${deviceId}`, 10, HOUR))) {
    return fail(c, 429, 'slow_down');
  }
  const normal = key ? normaliseKey(key) : null;
  if (!normal) return fail(c, 400, 'bad_key');
  const slot = await db.slotByHash(c.env, await sha256(normal));
  if (!slot) return fail(c, 404, 'key_not_found');
  const sub = await db.subscriber(c.env, slot.subscriber_id);
  if (!subscriptionLive(sub) || sub.plan !== 'share') return fail(c, 403, 'plan_inactive');

  const now = Date.now();
  const owner = sub.email_verified_at ? sub.email : null;
  if (!slot.device_id) {
    await db.updateSlot(c.env, slot.id, { device_id: deviceId, activated_at: now });
    await safeMail(c.env, owner, templates.usage(c.env, 'redeemed', slot.slot_no));
    const all = await db.slots(c.env, sub.id);
    if (all.every((s) => s.device_id || s.id === slot.id)) await safeMail(c.env, owner, templates.usage(c.env, 'full', slot.slot_no));
  } else if (slot.device_id !== deviceId) {
    const cooldown = Number(c.env.MOVE_COOLDOWN_DAYS || 30) * DAY;
    const lastMove = slot.moved_at ?? slot.activated_at ?? 0;
    if (now - lastMove < cooldown) return fail(c, 409, 'key_in_use', { retryAfter: lastMove + cooldown });
    await db.updateSlot(c.env, slot.id, { device_id: deviceId, moved_at: now });
    await safeMail(c.env, owner, templates.usage(c.env, 'moved', slot.slot_no));
  }
  return c.json(await friendToken(c.env, slot, deviceId, sub, now));
});

app.post('/v1/keys/refresh', async (c) => {
  const { token, deviceId } = await body<{ token: string; deviceId: string }>(c);
  const payload = token ? await verifyToken(token, c.env.TOKEN_SECRET, Date.now(), 30 * DAY) : null;
  if (!payload || payload.t !== 'friend' || payload.dev !== deviceId) return fail(c, 401, 'bad_token');
  const slot = await db.slot(c.env, payload.sid);
  if (!slot || slot.device_id !== deviceId) return fail(c, 403, 'key_replaced');
  const sub = await db.subscriber(c.env, slot.subscriber_id);
  if (!subscriptionLive(sub) || sub.plan !== 'share') return fail(c, 403, 'plan_inactive');
  return c.json(await friendToken(c.env, slot, deviceId, sub));
});

// ---------- Rates ----------

app.get('/v1/rates', async (c) => {
  const rates = await c.env.KV.get('rates');
  if (!rates) return fail(c, 503, 'rates_unavailable');
  return c.body(rates, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' });
});

// ---------- RevenueCat webhook ----------

const ACTIVE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'NON_RENEWING_PURCHASE']);

app.post('/webhooks/revenuecat', async (c) => {
  if (c.req.header('Authorization') !== c.env.REVENUECAT_WEBHOOK_AUTH) return fail(c, 401, 'unauthorised');
  const { event } = await body<{ event: RcWebhookEvent }>(c);
  if (!event?.type) return fail(c, 400, 'bad_event');
  if (event.type === 'TEST') return c.json({ ok: true });

  if (event.id && (await c.env.KV.get(`evt:${event.id}`))) return c.json({ ok: true, duplicate: true });

  const ids = [event.original_app_user_id ?? '', event.app_user_id, ...(event.aliases ?? [])];
  let sub = await db.subscriberByRc(c.env, ids);
  const isShare = (event.entitlement_ids ?? []).includes(c.env.ENTITLEMENT_SHARE);
  const now = Date.now();

  if (!sub && ACTIVE_EVENTS.has(event.type)) {
    sub = await syncSubscriber(c.env, event.original_app_user_id ?? event.app_user_id, {
      active: true, plan: isShare ? 'share' : 'solo', expiresAt: event.expiration_at_ms ?? null, willRenew: true,
    });
  }
  if (!sub) return c.json({ ok: true, ignored: true });
  const to = sub.email_verified_at ? sub.email : null;

  if (ACTIVE_EVENTS.has(event.type)) {
    const patch = { status: 'active' as const, expires_at: event.expiration_at_ms ?? sub.expires_at, will_renew: 1, plan: isShare ? ('share' as const) : ('solo' as const) };
    await db.updateSubscriber(c.env, sub.id, patch);
    if (event.type === 'RENEWAL' || event.type === 'INITIAL_PURCHASE') {
      await safeMail(c.env, to, templates.invoice(c.env, {
        amount: event.price, currency: event.currency, plan: patch.plan, from: now, to: patch.expires_at, store: event.store, orderId: event.id,
      }));
    }
  } else if (event.type === 'CANCELLATION') {
    await db.updateSubscriber(c.env, sub.id, { will_renew: 0 });
    await safeMail(c.env, to, templates.reminder(c.env, sub.expires_at, false, sub.plan));
  } else if (event.type === 'BILLING_ISSUE') {
    await safeMail(c.env, to, templates.lapsed(c.env, sub.plan, 'billing'));
  } else if (event.type === 'EXPIRATION') {
    await db.updateSubscriber(c.env, sub.id, { status: 'lapsed', will_renew: 0 });
    await safeMail(c.env, to, templates.lapsed(c.env, sub.plan, 'expired'));
  }

  if (event.id) await c.env.KV.put(`evt:${event.id}`, '1', { expirationTtl: 7 * 24 * 3600 });
  return c.json({ ok: true });
});

// ---------- Scheduled jobs ----------

export async function refreshRates(env: Env): Promise<void> {
  const res = await fetch(env.RATES_SOURCE_URL);
  if (!res.ok) throw new Error(`rates ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
  const perUsd = data.rates ?? {};
  if (data.result !== 'success' || perUsd.USD !== 1 || Object.keys(perUsd).length < 100) throw new Error('rates look wrong');
  const updatedAt = data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString() : new Date().toISOString();
  await env.KV.put('rates', JSON.stringify({ perUsd, updatedAt, source: 'Rates by Exchange Rate API (exchangerate-api.com)' }));
}

export async function sendReminders(env: Env, now = Date.now()): Promise<number> {
  const due = await db.dueReminders(env, now + 2.5 * DAY, now + 3.5 * DAY);
  for (const sub of due) {
    await safeMail(env, sub.email, templates.reminder(env, sub.expires_at, sub.will_renew === 1, sub.plan));
    await db.updateSubscriber(env, sub.id, { reminder_for: sub.expires_at });
  }
  return due.length;
}
