import type { Env } from './env';

export type Subscriber = {
  id: string;
  rc_user_id: string;
  email: string | null;
  email_verified_at: number | null;
  plan: 'solo' | 'share';
  status: 'active' | 'lapsed';
  expires_at: number | null;
  will_renew: number;
  reminder_for: number | null;
  created_at: number;
  updated_at: number;
};

export type Slot = {
  id: string;
  subscriber_id: string;
  slot_no: number;
  key_hash: string;
  key_enc: string;
  device_id: string | null;
  activated_at: number | null;
  moved_at: number | null;
  created_at: number;
};

export const db = {
  subscriberByRc: (env: Env, rcUserIds: string[]) => {
    const ids = rcUserIds.filter(Boolean);
    if (ids.length === 0) return Promise.resolve(null);
    const marks = ids.map(() => '?').join(',');
    return env.DB.prepare(`SELECT * FROM subscribers WHERE rc_user_id IN (${marks}) LIMIT 1`).bind(...ids).first<Subscriber>();
  },

  subscriber: (env: Env, id: string) => env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(id).first<Subscriber>(),

  insertSubscriber: (env: Env, s: Subscriber) =>
    env.DB.prepare(
      `INSERT INTO subscribers (id, rc_user_id, email, email_verified_at, plan, status, expires_at, will_renew, reminder_for, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(s.id, s.rc_user_id, s.email, s.email_verified_at, s.plan, s.status, s.expires_at, s.will_renew, s.reminder_for, s.created_at, s.updated_at)
      .run(),

  updateSubscriber: (env: Env, id: string, patch: Partial<Omit<Subscriber, 'id'>>) => {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (keys.length === 0) return Promise.resolve();
    const set = keys.map((k) => `${k} = ?`).join(', ');
    return env.DB.prepare(`UPDATE subscribers SET ${set}, updated_at = ? WHERE id = ?`)
      .bind(...keys.map((k) => patch[k] ?? null), Date.now(), id)
      .run();
  },

  slots: async (env: Env, subscriberId: string) =>
    (await env.DB.prepare('SELECT * FROM slots WHERE subscriber_id = ? ORDER BY slot_no').bind(subscriberId).all<Slot>()).results,

  slotByHash: (env: Env, keyHash: string) => env.DB.prepare('SELECT * FROM slots WHERE key_hash = ?').bind(keyHash).first<Slot>(),

  slot: (env: Env, id: string) => env.DB.prepare('SELECT * FROM slots WHERE id = ?').bind(id).first<Slot>(),

  insertSlot: (env: Env, s: Slot) =>
    env.DB.prepare(
      `INSERT INTO slots (id, subscriber_id, slot_no, key_hash, key_enc, device_id, activated_at, moved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(s.id, s.subscriber_id, s.slot_no, s.key_hash, s.key_enc, s.device_id, s.activated_at, s.moved_at, s.created_at)
      .run(),

  updateSlot: (env: Env, id: string, patch: Partial<Omit<Slot, 'id' | 'subscriber_id' | 'slot_no'>>) => {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    const set = keys.map((k) => `${k} = ?`).join(', ');
    return env.DB.prepare(`UPDATE slots SET ${set} WHERE id = ?`).bind(...keys.map((k) => patch[k] ?? null), id).run();
  },

  code: (env: Env, subscriberId: string) =>
    env.DB.prepare('SELECT * FROM email_codes WHERE subscriber_id = ?').bind(subscriberId).first<{
      subscriber_id: string; email: string; code_hash: string; expires_at: number; attempts: number; sent_at: number;
    }>(),

  putCode: (env: Env, subscriberId: string, email: string, codeHash: string, expiresAt: number) =>
    env.DB.prepare(
      `INSERT INTO email_codes (subscriber_id, email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(subscriber_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash,
       expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
    )
      .bind(subscriberId, email, codeHash, expiresAt, Date.now())
      .run(),

  bumpCodeAttempts: (env: Env, subscriberId: string) =>
    env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE subscriber_id = ?').bind(subscriberId).run(),

  deleteCode: (env: Env, subscriberId: string) =>
    env.DB.prepare('DELETE FROM email_codes WHERE subscriber_id = ?').bind(subscriberId).run(),

  dueReminders: async (env: Env, from: number, to: number) =>
    (
      await env.DB.prepare(
        `SELECT * FROM subscribers WHERE status = 'active' AND email_verified_at IS NOT NULL
         AND expires_at BETWEEN ? AND ? AND (reminder_for IS NULL OR reminder_for != expires_at)`,
      )
        .bind(from, to)
        .all<Subscriber>()
    ).results,
};

/** Fixed-window limiter. Returns false once `limit` hits land inside `windowMs`. */
export async function allow(env: Env, bucket: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const row = await env.DB.prepare('SELECT count, window_start FROM attempts WHERE bucket = ?').bind(bucket).first<{ count: number; window_start: number }>();
  if (!row || now - row.window_start >= windowMs) {
    await env.DB.prepare(
      `INSERT INTO attempts (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start`,
    ).bind(bucket, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE bucket = ?').bind(bucket).run();
  return true;
}
