import type { Env } from './env';

export type Entitlement = {
  active: boolean;
  plan: 'solo' | 'share' | null;
  expiresAt: number | null;
  willRenew: boolean;
};

type RcEntitlement = { expires_date: string | null; product_identifier: string };
type RcSubscription = { expires_date: string | null; unsubscribe_detected_at: string | null };
type RcSubscriberResponse = {
  subscriber: {
    original_app_user_id: string;
    entitlements: Record<string, RcEntitlement>;
    subscriptions: Record<string, RcSubscription>;
  };
};

/** Asks RevenueCat which plan an app user really has. Never trusts the app's word for it. */
export async function fetchEntitlement(env: Env, rcUserId: string, now = Date.now()): Promise<Entitlement> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}`, Accept: 'application/json' },
  });
  if (res.status === 404) return { active: false, plan: null, expiresAt: null, willRenew: false };
  if (!res.ok) throw new Error(`revenuecat ${res.status}`);
  const data = (await res.json()) as RcSubscriberResponse;
  return entitlementFrom(data, env, now);
}

export function entitlementFrom(data: RcSubscriberResponse, env: Env, now = Date.now()): Entitlement {
  const ents = data.subscriber.entitlements ?? {};
  const isActive = (e?: RcEntitlement) => !!e && (e.expires_date === null || Date.parse(e.expires_date) > now);
  const share = ents[env.ENTITLEMENT_SHARE];
  const any = ents[env.ENTITLEMENT_ANY];
  const best = isActive(share) ? share : isActive(any) ? any : undefined;
  if (!best) return { active: false, plan: null, expiresAt: null, willRenew: false };
  const sub = data.subscriber.subscriptions?.[best.product_identifier];
  return {
    active: true,
    plan: isActive(share) ? 'share' : 'solo',
    expiresAt: best.expires_date ? Date.parse(best.expires_date) : null,
    willRenew: !sub?.unsubscribe_detected_at,
  };
}

/** The webhook body RevenueCat posts. Only the fields Tagio reads. */
export type RcWebhookEvent = {
  type: string;
  id: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  price?: number | null;
  currency?: string | null;
  store?: string;
  period_type?: string;
};
