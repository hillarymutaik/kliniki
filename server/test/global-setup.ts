import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

import { migrate } from '../src/migrate';

export const SUPERUSER_PASSWORD = 'test-superuser';
export const APP_PASSWORD = 'test-app-password';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

/**
 * Starts one real PostgreSQL for the whole run (no mocks: row locks, row-level security and savepoints
 * are what is being tested) and builds a migrated template database that every test file clones.
 */
export default async function setup(project: TestProject) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'kliniki-pg-'));
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: SUPERUSER_PASSWORD,
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();

  const owner = (database: string) => `postgres://postgres:${SUPERUSER_PASSWORD}@127.0.0.1:${port}/${database}`;
  const admin = new pg.Client({ connectionString: owner('postgres') });
  await admin.connect();
  await admin.query('CREATE DATABASE template_kliniki');
  await admin.end();
  await migrate({ ownerUrl: owner('template_kliniki'), appPassword: APP_PASSWORD });

  project.provide('pgPort', port);

  return async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgPort: number;
  }
}
