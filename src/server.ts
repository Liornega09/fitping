import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = await buildApp();

  await app.listen({
    host: '0.0.0.0',
    port: config.PORT
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
