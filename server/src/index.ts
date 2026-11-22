import { app, refreshRates, sendReminders } from './app';
import type { Env } from './env';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '23 6 * * *') ctx.waitUntil(sendReminders(env).then(() => undefined));
    else ctx.waitUntil(refreshRates(env));
  },
} satisfies ExportedHandler<Env>;
