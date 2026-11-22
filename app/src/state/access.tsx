import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { config } from '../config';
import { api, ApiError, type FriendGrant, type OwnerAccess } from '../lib/api';
import { installId, prefs, secure } from '../lib/storage';

export type Plan = 'solo' | 'share';

export type AccessState =
  | { kind: 'loading' }
  | { kind: 'none'; reason: 'never' | 'lapsed' | 'key-paused' | 'key-replaced' | 'key-offline' }
  | { kind: 'owner'; plan: Plan; expiresAt: number | null; willRenew: boolean }
  | { kind: 'friend'; expiresAt: number };

export type PlanOffer = { id: Plan; price: string | null; pkg?: PurchasesPackage };

type Ctx = {
  access: AccessState;
  hasAccess: boolean;
  offers: Record<Plan, PlanOffer>;
  purchase: (plan: Plan) => Promise<'done' | 'cancelled'>;
  restore: () => Promise<boolean>;
  manageSubscription: () => Promise<void>;
  // Owner email and friend keys
  owner: OwnerAccess | null;
  startEmail: (email: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<OwnerAccess>;
  refreshOwner: () => Promise<void>;
  replaceSlot: (slotNo: number) => Promise<void>;
  // Friends
  redeem: (key: string) => Promise<void>;
};

const AccessContext = createContext<Ctx | null>(null);
const REFRESH_BEFORE_MS = 48 * 60 * 60 * 1000; // refresh friend tokens once they have under 2 of 3 days left

function ownerStateFrom(info: CustomerInfo): AccessState | null {
  const share = info.entitlements.active[config.entitlements.share];
  const any = info.entitlements.active[config.entitlements.any];
  const ent = share ?? any;
  if (!ent) return null;
  return {
    kind: 'owner',
    plan: share ? 'share' : 'solo',
    expiresAt: ent.expirationDate ? Date.parse(ent.expirationDate) : null,
    willRenew: ent.willRenew,
  };
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [ownerState, setOwnerState] = useState<AccessState | null>(null);
  const [hadOwnerPlan, setHadOwnerPlan] = useState(false);
  const [friend, setFriend] = useState<FriendGrant | null>(null);
  const [friendProblem, setFriendProblem] = useState<'key-paused' | 'key-replaced' | null>(null);
  const [owner, setOwner] = useState<OwnerAccess | null>(null);
  const [offers, setOffers] = useState<Record<Plan, PlanOffer>>({ solo: { id: 'solo', price: null }, share: { id: 'share', price: null } });
  const [ready, setReady] = useState(false);
  const configured = useRef(false);

  const applyCustomerInfo = useCallback((info: CustomerInfo) => {
    const s = ownerStateFrom(info);
    setOwnerState(s);
    if (s || Object.keys(info.entitlements.all).length > 0) setHadOwnerPlan(true);
  }, []);

  // Store billing
  useEffect(() => {
    if (configured.current || !config.revenueCatKey) {
      setReady(true);
      return;
    }
    configured.current = true;
    Purchases.configure({ apiKey: config.revenueCatKey });
    Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
    Purchases.getCustomerInfo().then(applyCustomerInfo).catch(() => {}).finally(() => setReady(true));
    Purchases.getOfferings()
      .then((o) => {
        const pkgs = o.current?.availablePackages ?? [];
        const find = (id: string) => pkgs.find((p) => p.identifier === id);
        const solo = find(config.packages.solo);
        const share = find(config.packages.share);
        setOffers({
          solo: { id: 'solo', price: solo?.product.priceString ?? null, pkg: solo },
          share: { id: 'share', price: share?.product.priceString ?? null, pkg: share },
        });
      })
      .catch(() => {});
    return () => {
      Purchases.removeCustomerInfoUpdateListener(applyCustomerInfo);
    };
  }, [applyCustomerInfo]);

  // Friend token: load, then keep fresh while the app is used.
  const refreshFriend = useCallback(async (grant: FriendGrant | null) => {
    if (!grant) return;
    if (grant.expiresAt - Date.now() > REFRESH_BEFORE_MS) return;
    try {
      const next = await api.refresh(grant.token, await installId());
      await secure.set('friend', JSON.stringify(next));
      setFriend(next);
      setFriendProblem(null);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'key_replaced' || e.code === 'bad_token')) {
        await secure.remove('friend');
        setFriend(null);
        setFriendProblem('key-replaced');
      } else if (e instanceof ApiError && e.code === 'plan_inactive') {
        setFriendProblem('key-paused');
      }
      // Offline: the token keeps working until it expires.
    }
  }, []);

  useEffect(() => {
    secure.get('friend').then((raw) => {
      const grant = raw ? (JSON.parse(raw) as FriendGrant) : null;
      setFriend(grant);
      refreshFriend(grant);
    });
    secure.get('owner').then((token) => {
      if (token) prefs.get<OwnerAccess>('owner_access').then((o) => o && setOwner(o));
    });
  }, [refreshFriend]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshFriend(friend);
    });
    return () => sub.remove();
  }, [friend, refreshFriend]);

  const access: AccessState = useMemo(() => {
    if (!ready) return { kind: 'loading' };
    if (ownerState) return ownerState;
    if (friend && friend.expiresAt > Date.now() && !friendProblem) return { kind: 'friend', expiresAt: friend.expiresAt };
    if (friendProblem) return { kind: 'none', reason: friendProblem };
    if (friend) return { kind: 'none', reason: 'key-offline' }; // token ran out while offline
    return { kind: 'none', reason: hadOwnerPlan ? 'lapsed' : 'never' };
  }, [ready, ownerState, friend, friendProblem, hadOwnerPlan]);

  const purchase = useCallback(async (plan: Plan) => {
    const pkg = offers[plan].pkg;
    if (!pkg) throw new Error('This plan isn’t available right now. Try again in a moment.');
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(customerInfo);
      return 'done' as const;
    } catch (e) {
      const err = e as { code?: string; userCancelled?: boolean | null };
      if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled' as const;
      throw new Error('The purchase didn’t go through. You haven’t been charged.');
    }
  }, [offers, applyCustomerInfo]);

  const restore = useCallback(async () => {
    const info = await Purchases.restorePurchases();
    applyCustomerInfo(info);
    return !!ownerStateFrom(info);
  }, [applyCustomerInfo]);

  const manageSubscription = useCallback(() => Purchases.showManageSubscriptions(), []);

  const saveOwner = useCallback(async (o: OwnerAccess) => {
    setOwner(o);
    await prefs.set('owner_access', o);
  }, []);

  const startEmail = useCallback(async (email: string) => {
    await api.startEmail(await Purchases.getAppUserID(), email);
  }, []);

  const verifyEmail = useCallback(async (code: string) => {
    const { ownerToken, access: o } = await api.verifyEmail(await Purchases.getAppUserID(), code);
    await secure.set('owner', ownerToken);
    await saveOwner(o);
    return o;
  }, [saveOwner]);

  const refreshOwner = useCallback(async () => {
    const token = await secure.get('owner');
    if (!token) return;
    try {
      await saveOwner(await api.ownerAccess(token));
    } catch {
      // Keep the last view when offline.
    }
  }, [saveOwner]);

  const replaceSlot = useCallback(async (slotNo: number) => {
    const token = await secure.get('owner');
    if (!token) throw new Error('Add your email first.');
    await saveOwner(await api.replaceSlot(token, slotNo));
  }, [saveOwner]);

  const redeem = useCallback(async (key: string) => {
    const grant = await api.redeem(key, await installId());
    await secure.set('friend', JSON.stringify(grant));
    setFriend(grant);
    setFriendProblem(null);
  }, []);

  const value: Ctx = {
    access,
    hasAccess: access.kind === 'owner' || access.kind === 'friend',
    offers,
    purchase,
    restore,
    manageSubscription,
    owner,
    startEmail,
    verifyEmail,
    refreshOwner,
    replaceSlot,
    redeem,
  };
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): Ctx {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess outside AccessProvider');
  return ctx;
}
