import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { whatsappWebhookRoute } from './routes/whatsapp.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    // Trust X-Forwarded-* headers so request.protocol/hostname reflect the
    // public URL Twilio called (needed for signature verification behind
    // ngrok / Render / other proxies).
    trustProxy: true
  });

  await app.register(formbody);
  await app.register(whatsappWebhookRoute);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
