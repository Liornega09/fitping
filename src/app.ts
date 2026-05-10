import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { internalJobsRoute } from './routes/internalJobs.js';
import { whatsappWebhookRoute, type WhatsappRouteOptions } from './routes/whatsapp.js';

export type BuildAppOptions = {
  whatsapp?: WhatsappRouteOptions;
};

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    logger: true,
    // Trust X-Forwarded-* headers so request.protocol/hostname reflect the
    // public URL Twilio called (needed for signature verification behind
    // ngrok / Render / other proxies).
    trustProxy: true
  });

  await app.register(formbody);
  await app.register(whatsappWebhookRoute, opts.whatsapp ?? {});
  await app.register(internalJobsRoute);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
