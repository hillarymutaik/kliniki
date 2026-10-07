import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
export const APP_ROLE = 'kliniki_app';

// Taken while migrating so two instances starting together cannot apply the same migration twice.
const LOCK_KEY = 7_313_001;

export interface MigrateOptions {
  /** Connection as the schema owner. */
  ownerUrl: string;
  /** The unprivileged role the API connects as. Defaults to kliniki_app. */
  appRole?: string;
  /** If given, the API role is created (or its password reset) with this password. */
  appPassword?: string;
  dir?: string;
  log?: (message: string) => void;
}

/**
 * Applies pending SQL migrations in filename order, each in its own transaction, and makes sure the API
 * role exists as NOSUPERUSER NOBYPASSRLS. Returns the names it applied.
 */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const log = options.log ?? (() => {});
  const role = options.appRole ?? APP_ROLE;
  // The name goes into SQL text as an identifier, so it is held to a strict shape.
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`Invalid database role name "${role}".`);
  const client = new pg.Client({ connectionString: options.ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    if (options.appPassword) {
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      // format(%L) quotes the password safely; DDL cannot take bind parameters.
      const { rows } = await client.query(
        `SELECT format('${verb} ROLE ${role} LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', $1::text) AS sql`,
        [options.appPassword],
      );
      await client.query(rows[0].sql);
      // A stuck client must not hold locks open for ever.
      await client.query(`ALTER ROLE ${role} SET idle_in_transaction_session_timeout = '30s'`);
    }

    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string));
    const dir = options.dir ?? MIGRATIONS_DIR;
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      log(`applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(readFileSync(join(dir, file), 'utf8').replaceAll('{{APP_ROLE}}', role));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}
