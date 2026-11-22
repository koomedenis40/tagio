import { Platform } from 'react-native';

export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  revenueCatKey: Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }),
  /** RevenueCat entitlement ids. Every plan grants `any`; the Share plan also grants `share`. */
  entitlements: { any: 'tagio', share: 'share' },
  /** RevenueCat package identifiers in the current offering. */
  packages: { solo: 'solo_monthly', share: 'share_monthly' },
  friendSlots: 2,
  ratesMaxAgeMs: 60 * 60 * 1000,
  privacyUrl: 'https://tagio.app/privacy',
  termsUrl: 'https://tagio.app/terms',
};
