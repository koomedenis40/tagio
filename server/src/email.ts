import type { Env } from './env';

export type Mail = { to: string; subject: string; text: string };

/** Sends through Resend. Plain text keeps the emails readable everywhere and easy to audit. */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

const date = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'your renewal date';

const footer = (env: Env) =>
  `\n\nTagio never stores what you scan. Questions? Reply to this email or write to ${env.SUPPORT_EMAIL}.`;

export const templates = {
  code: (env: Env, code: string) => ({
    subject: `${code} is your Tagio code`,
    text: `Your Tagio code is ${code}.\n\nIt expires in 15 minutes. If you didn't ask for it, you can ignore this email.${footer(env)}`,
  }),

  keys: (env: Env, keys: string[], renews: number | null) => ({
    subject: 'Your Tagio friend keys',
    text:
      `Here are the keys to share with your friends. Each one works on one phone.\n\n` +
      keys.map((k, i) => `Friend key ${i + 1}: ${k}`).join('\n') +
      `\n\nYour friends install Tagio, tap "I have a friend key" and enter it. The keys keep working while your plan renews (next: ${date(renews)}).` +
      `\n\nYou can see who's using a key, or replace it, in Tagio under Settings > Access.${footer(env)}`,
  }),

  newKey: (env: Env, slotNo: number, key: string) => ({
    subject: `New key for friend slot ${slotNo}`,
    text: `You replaced friend key ${slotNo}. The old key stopped working straight away.\n\nNew key: ${key}${footer(env)}`,
  }),

  invoice: (env: Env, o: { amount?: number | null; currency?: string | null; plan: string; from: number; to: number | null; store?: string; orderId: string }) => ({
    subject: `Tagio receipt: ${date(o.from)}`,
    text:
      `Thanks for renewing Tagio ${o.plan === 'share' ? 'Share' : 'Solo'}.\n\n` +
      (o.amount != null && o.currency ? `Amount: ${o.amount.toFixed(2)} ${o.currency}\n` : '') +
      `Period: ${date(o.from)} to ${date(o.to)}\n` +
      `Paid through: ${o.store === 'PLAY_STORE' ? 'Google Play' : o.store === 'APP_STORE' ? 'App Store' : o.store ?? 'your app store'}\n` +
      `Reference: ${o.orderId}\n\nYour app store also sends its own official receipt.${footer(env)}`,
  }),

  reminder: (env: Env, expiresAt: number | null, willRenew: boolean, plan: string) => ({
    subject: willRenew ? `Tagio renews on ${date(expiresAt)}` : `Tagio ends on ${date(expiresAt)}`,
    text: willRenew
      ? `Your Tagio ${plan === 'share' ? 'Share' : 'Solo'} plan renews on ${date(expiresAt)}. Nothing to do if you want to keep it.\n\nTo cancel, open your App Store or Google Play subscriptions.${footer(env)}`
      : `Auto-renew is off, so Tagio stops converting on ${date(expiresAt)}.` +
        (plan === 'share' ? ` Your friends' keys will pause on the same day.` : '') +
        `\n\nTo keep it, turn auto-renew back on in your App Store or Google Play subscriptions.${footer(env)}`,
  }),

  lapsed: (env: Env, plan: string, reason: 'expired' | 'billing') => ({
    subject: reason === 'billing' ? 'Tagio payment didn’t go through' : 'Your Tagio plan has ended',
    text:
      (reason === 'billing'
        ? `Your app store couldn't take the payment for Tagio. Update your payment method in the App Store or Google Play to keep converting.`
        : `Your Tagio plan has ended, so the app has stopped converting prices.`) +
      (plan === 'share' ? `\n\nYour friend keys are paused. They start working again, unchanged, when you renew.` : '') +
      footer(env),
  }),

  usage: (env: Env, what: 'redeemed' | 'moved' | 'full', slotNo: number) => ({
    subject:
      what === 'redeemed' ? `Friend key ${slotNo} is now in use` : what === 'moved' ? `Friend key ${slotNo} moved to a new phone` : 'Both friend keys are in use',
    text:
      (what === 'redeemed'
        ? `Someone just started using friend key ${slotNo} on their phone.`
        : what === 'moved'
          ? `Friend key ${slotNo} was moved to a different phone. The previous phone no longer has access.`
          : `Both of your friend keys are now in use.`) +
      `\n\nNot expected? Open Tagio, go to Settings > Access and replace the key.${footer(env)}`,
  }),
};
