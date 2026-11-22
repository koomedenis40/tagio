# Tagio

Point your phone at a price tag and see the price in your own currency. No tapping, no account, and nothing you scan is stored.

```
tagio/
  app/      Expo (React Native) app for iOS and Android
  server/   Cloudflare Worker: friend keys, email, store webhooks, rates file
```

## What's in the box

**App** (`app/`, Expo SDK 58, TypeScript, Expo Router)
- Live camera with on-device text recognition (VisionCamera 5 + ML Kit through `react-native-vision-camera-ocr-plus`). Frames never leave the phone and are never written to disk.
- Price reader (`src/core/price.ts`): picks the price on a tag and skips weights, dates, percentages and barcodes. It understands `1,299.00`, `1.299,00`, `1 299,50`, `450/-`, split cents and more, flags per-kg prices and pushes down "was" prices.
- Currency detection (`src/core/detect.ts`): ISO codes, then symbols (shared ones like `$`, `kr` and `Sh` are settled by the phone's region or the last confirmed currency), then region. Never uses GPS.
- 153 currencies with flags. Rates come from one public file, so the server never learns which currencies you use. A bundled snapshot covers first launch offline.
- Glass conversion bar: tap From or To to open the full currency list. A scan guide with lock motion. Reduce Motion is respected.
- Store billing through RevenueCat (Solo and Share plans), email confirmation, friend keys, redeeming and replacing keys, and the access-ended state.

**Server** (`server/`, Hono on Cloudflare Workers + D1 + KV)
- `POST /v1/owner/email/start` and `/verify`: the email code. Checks the real subscription with RevenueCat and never trusts the app.
- `GET /v1/owner/access`, `POST /v1/owner/slots/:n/replace`: the owner's plan and friend slots.
- `POST /v1/keys/redeem`, `/v1/keys/refresh`: friend keys tie to one phone; a key can move once every 30 days. Tokens last 72 hours offline and never outlive the plan.
- `POST /webhooks/revenuecat`: renewals, cancellations, billing issues and expiry, each with its email (receipt, reminder, lapsed).
- Cron: rates every hour; renewal reminders 3 days ahead, every day.
- Stores only email, plan status and hashed or encrypted keys. Nothing about scans.

## Tests

```bash
cd app && npm test        # 54 tests: price reader, currency detection, conversion, key input
cd server && npm test     # 14 tests: email codes, keys, redeem/move/replace, webhooks, cron jobs
```

Both projects typecheck (`npm run typecheck`). The app's JavaScript bundles for iOS and Android, and `expo prebuild` generates both native projects.

## Setup

### 1. Accounts you need
- Apple Developer Program and Google Play Console.
- [RevenueCat](https://www.revenuecat.com): connect both stores.
  - Products: one monthly subscription for **Solo** and one for **Share**.
  - Entitlements: `tagio` (attach both products) and `share` (attach the Share product only).
  - Current offering with packages `solo_monthly` and `share_monthly` (ids are in `app/src/config.ts`).
- [Cloudflare](https://dash.cloudflare.com) (Workers free plan is enough to start).
- [Resend](https://resend.com) for email, with your sending domain verified.

### 2. Deploy the server
```bash
cd server
npm install
npx wrangler d1 create tagio            # copy database_id into wrangler.toml
npx wrangler kv namespace create KV     # copy id into wrangler.toml
npx wrangler secret put TOKEN_SECRET            # long random string
npx wrangler secret put KEY_ENC_SECRET          # another long random string
npx wrangler secret put REVENUECAT_API_KEY      # RevenueCat secret key (v1)
npx wrangler secret put REVENUECAT_WEBHOOK_AUTH # e.g. "Bearer <random>"
npx wrangler secret put RESEND_API_KEY
npm run db:migrate
npm run deploy
```
Then, in RevenueCat, add a webhook to `https://<your-worker>/webhooks/revenuecat` with the same Authorization value. Edit `MAIL_FROM` and `SUPPORT_EMAIL` in `wrangler.toml`. The rates file appears after the first hourly run. To fill it straight away, run `npx wrangler dev --test-scheduled`, then open `/__scheduled?cron=7+*+*+*+*`.

### 3. Run the app
```bash
cd app
cp .env.example .env      # API URL and RevenueCat public keys
npm install
npx expo prebuild
npx expo run:ios --device # or: npx expo run:android
```
Use a real phone. ML Kit has no Apple Silicon simulator build, and a simulator has no camera anyway. For store builds, use EAS (`npx eas build`).

## Before launch
- **Tune on real tags.** The parser is unit-tested on many formats. Before launch, test it on 50 or more real tags from your launch countries and add each miss as a test in `src/core/__tests__/core.test.ts`.
- **App Review:** explain friend keys in the review notes (keys only come from the Share in-app purchase) and include a demo key.
- **Placeholders to replace:** the app icon (`app/assets`), the privacy and terms URLs (`app/src/config.ts`), and prices (set in App Store Connect and Play Console; the app shows whatever the store returns).
- **Android glass:** Android can't blur a live camera view, so the glass there is a deeper translucent tint. iOS blurs for real.
- **Flags** are emoji, which render on both platforms. To match the mockup's flat flags exactly, swap in an SVG flag set.
- **Rates:** the default source is the free Exchange Rate API (open.er-api.com), which updates daily and requires the attribution already shown in Settings. For hourly rates, point `RATES_SOURCE_URL` at a paid feed with the same response shape, or adapt `refreshRates` in `server/src/app.ts`.
