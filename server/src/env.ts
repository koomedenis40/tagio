export type Env = {
  DB: D1Database;
  KV: KVNamespace;

  APP_NAME: string;
  MAIL_FROM: string;
  SUPPORT_EMAIL: string;
  RATES_SOURCE_URL: string;
  ENTITLEMENT_ANY: string;
  ENTITLEMENT_SHARE: string;
  FRIEND_SLOTS: string;
  MOVE_COOLDOWN_DAYS: string;
  TOKEN_TTL_HOURS: string;

  TOKEN_SECRET: string;
  KEY_ENC_SECRET: string;
  REVENUECAT_API_KEY: string;
  REVENUECAT_WEBHOOK_AUTH: string;
  RESEND_API_KEY: string;
};

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
