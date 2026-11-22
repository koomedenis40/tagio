-- Tagio stores only what billing and friend keys need. Nothing about scans.

CREATE TABLE subscribers (
  id                TEXT PRIMARY KEY,
  rc_user_id        TEXT NOT NULL UNIQUE,      -- RevenueCat app user id (anonymous)
  email             TEXT,
  email_verified_at INTEGER,
  plan              TEXT NOT NULL DEFAULT 'solo', -- solo | share
  status            TEXT NOT NULL DEFAULT 'active', -- active | lapsed
  expires_at        INTEGER,                   -- ms epoch
  will_renew        INTEGER NOT NULL DEFAULT 1,
  reminder_for      INTEGER,                   -- expires_at the last reminder was sent for
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE email_codes (
  subscriber_id TEXT PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  sent_at       INTEGER NOT NULL
);

CREATE TABLE slots (
  id            TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  slot_no       INTEGER NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,          -- SHA-256 of the key, for lookup
  key_enc       TEXT NOT NULL,                 -- AES-GCM encrypted key, so the owner can see it again
  device_id     TEXT,                          -- random install id, not a hardware id
  activated_at  INTEGER,
  moved_at      INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE (subscriber_id, slot_no)
);

CREATE TABLE attempts (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE INDEX idx_subscribers_expiry ON subscribers (status, expires_at);
