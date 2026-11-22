import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Env } from '../src/env';

/** Just enough of D1 on top of Node's built-in SQLite to run the real queries. */
export function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const norm = (v: unknown[]) => v.map((x) => (x === undefined ? null : x)) as (string | number | null)[];
  const statement = (sql: string, params: unknown[] = []): any => ({
    bind: (...p: unknown[]) => statement(sql, p),
    first: async () => (sqlite.prepare(sql).get(...norm(params)) as object | undefined) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...norm(params)), success: true }),
    run: async () => {
      sqlite.prepare(sql).run(...norm(params));
      return { success: true };
    },
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

export function fakeKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
  } as unknown as KVNamespace;
}

export function testEnv(): Env {
  return {
    DB: fakeD1(),
    KV: fakeKV(),
    APP_NAME: 'Tagio',
    MAIL_FROM: 'Tagio <hello@tagio.test>',
    SUPPORT_EMAIL: 'support@tagio.test',
    RATES_SOURCE_URL: 'https://rates.test/latest/USD',
    ENTITLEMENT_ANY: 'tagio',
    ENTITLEMENT_SHARE: 'share',
    FRIEND_SLOTS: '2',
    MOVE_COOLDOWN_DAYS: '30',
    TOKEN_TTL_HOURS: '72',
    TOKEN_SECRET: 'test-token-secret-0123456789',
    KEY_ENC_SECRET: 'test-enc-secret-0123456789',
    REVENUECAT_API_KEY: 'rc_test',
    REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret',
    RESEND_API_KEY: 're_test',
  };
}
