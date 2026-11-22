import { config } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const { error, ...extra } = data as { error?: string };
    throw new ApiError(res.status, error ?? 'server_error', extra);
  }
  return data;
}

export type Slot = { slotNo: number; key: string; inUse: boolean; activatedAt: number | null };
export type OwnerAccess = {
  plan: 'solo' | 'share';
  status: 'active' | 'lapsed';
  expiresAt: number | null;
  willRenew: boolean;
  email: string | null;
  slots: Slot[];
};
export type FriendGrant = { token: string; expiresAt: number; planRenewsAt: number | null };

export const api = {
  startEmail: (appUserId: string, email: string) =>
    request<{ ok: true; plan: string }>('/v1/owner/email/start', { body: { appUserId, email } }),
  verifyEmail: (appUserId: string, code: string) =>
    request<{ ownerToken: string; access: OwnerAccess }>('/v1/owner/email/verify', { body: { appUserId, code } }),
  ownerAccess: (token: string) => request<OwnerAccess>('/v1/owner/access', { token }),
  replaceSlot: (token: string, slotNo: number) =>
    request<OwnerAccess>(`/v1/owner/slots/${slotNo}/replace`, { token, method: 'POST' }),
  redeem: (key: string, deviceId: string) => request<FriendGrant>('/v1/keys/redeem', { body: { key, deviceId } }),
  refresh: (token: string, deviceId: string) => request<FriendGrant>('/v1/keys/refresh', { body: { token, deviceId } }),
  rates: () => request<{ perUsd: Record<string, number>; updatedAt: string; source?: string }>('/v1/rates'),
};

/** Words a person can act on, for every error the API returns. */
export function errorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'unknown';
  switch (code) {
    case 'offline': return 'You’re offline. Connect to the internet and try again.';
    case 'bad_email': return 'That email doesn’t look right.';
    case 'no_subscription': return 'We couldn’t find an active Tagio plan on this phone. Try Restore purchases.';
    case 'wrong_code':
    case 'bad_code': return 'That code isn’t right. Check the email and try again.';
    case 'code_expired': return 'That code has expired. Send a new one.';
    case 'too_many_attempts': return 'Too many tries. Send a new code.';
    case 'bad_key': return 'That doesn’t look like a Tagio key. Keys look like TAG-7KQ2-M9PX.';
    case 'key_not_found': return 'We couldn’t find that key. It may have been replaced. Ask your friend for the latest one.';
    case 'key_in_use': return 'This key is already in use on another phone. It can move to a new phone once every 30 days.';
    case 'plan_inactive': return 'The plan behind this key isn’t active right now. Ask your friend to renew.';
    case 'slow_down': return 'Too many tries. Wait a few minutes and try again.';
    case 'store_unavailable':
    case 'mail_unavailable': return 'Something on our side is busy. Try again in a minute.';
    default: return 'Something went wrong. Try again.';
  }
}
