import { buildApp } from './app';
import { loadConfig } from './config';
import { createPool } from './db';

async function main() {
  const config = loadConfig(); // refuses to start on a missing or weak secret
  const pool = createPool(config.DATABASE_URL, config.DB_POOL_MAX, config.DB_CONNECT_TIMEOUT_MS);
  const app = await buildApp({ config, pool });

  // Stop taking requests, let in-flight ones finish, then release the database.
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
