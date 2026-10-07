// A local PostgreSQL for development, with nothing to install: it runs the same embedded PostgreSQL the
// tests use, keeps its data in server/.pgdata, applies the migrations, and writes server/.env the first time.
//
//   npm run dev:db      (leave it running)      then, in another terminal:      npm run dev
//
// This is for development only. Production needs a properly operated PostgreSQL (see README, "Hosting").
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

import { migrate } from '../src/migrate';

const root = fileURLToPath(new URL('..', import.meta.url));
// Overridable so a second, separate local database (or a test of this script) never touches the usual one.
const dataDir = process.env.DEV_PG_DIR ?? join(root, '.pgdata');
const envFile = process.env.DEV_ENV_FILE ?? join(root, '.env');
const port = Number(process.env.DEV_PG_PORT ?? 54329);

// Local-only credentials for a database that listens on this computer alone.
//   kliniki  (password kliniki)  the API's restricted role, subject to row-level security
//   postgres (password kliniki)  the owner, for migrations and for browsing the data in a database tool
const DATABASE = 'kliniki';
const APP_ROLE = 'kliniki';
const PASSWORD = 'kliniki';

async function main() {
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: PASSWORD,
    port,
    persistent: true,
    onLog: () => {},
    onError: (error) => console.error(String(error)),
  });

  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log('Setting up a new local database (first run only)...');
    await server.initialise();
  }
  await server.start();

  // A data folder from an earlier version of this script has the old passwords and a differently named role.
  const probe = new pg.Client({ connectionString: `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/postgres` });
  try {
    await probe.connect();
    await probe.end();
  } catch (error) {
    await server.stop();
    if ((error as { code?: string }).code === '28P01') {
      console.error(
        [
          'This local database was created by an older version of this script, with different names and passwords.',
          'It only holds development data. To start over with the kliniki / kliniki / kliniki setup:',
          '  1. delete the server/.pgdata folder',
          '  2. delete server/.env',
          '  3. run npm run dev:db again',
        ].join('\n'),
      );
      process.exit(1);
    }
    throw error;
  }

  try {
    await server.createDatabase(DATABASE);
  } catch {
    // already exists from an earlier run
  }

  const ownerUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;
  const applied = await migrate({ ownerUrl, appRole: APP_ROLE, appPassword: PASSWORD, log: (m) => console.log(m) });
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');

  if (!existsSync(envFile)) {
    writeFileSync(
      envFile,
      [
        '# Written by `npm run dev:db`. Local development only; never use these values in production.',
        `DATABASE_URL=postgres://${APP_ROLE}:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`,
        `DATABASE_OWNER_URL=${ownerUrl}`,
        `APP_DB_ROLE=${APP_ROLE}`,
        `APP_DB_PASSWORD=${PASSWORD}`,
        `JWT_SECRET=${randomBytes(48).toString('base64url')}`,
        'CORS_ORIGINS=http://localhost:8081,http://localhost:19006',
        'NODE_ENV=development',
        'LOG_LEVEL=info',
        '',
      ].join('\n'),
    );
    console.log('Wrote server/.env');
  }

  console.log(`\nLocal database is running on port ${port}. Leave this window open.`);
  console.log('In another terminal, from the server folder:  npm run dev');
  console.log('Press Ctrl+C here to stop the database (your data is kept).');

  const stop = async () => {
    console.log('\nStopping the database...');
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
