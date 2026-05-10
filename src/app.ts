import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { whatsappWebhookRoute } from './routes/whatsapp.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(formbody);
  await app.register(whatsappWebhookRoute);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
