import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';
import { inject, describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate';
import { SUPERUSER_PASSWORD } from './global-setup';

const port = () => inject('pgPort');
const ownerUrl = (db: string) => `postgres://postgres:${SUPERUSER_PASSWORD}@127.0.0.1:${port()}/${db}`;

async function freshDatabase() {
  const name = `m_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Client({ connectionString: ownerUrl('postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  return name;
}

describe('migrations', () => {
  it('apply once, and applying again is a no-op', async () => {
    const db = await freshDatabase();
    const first = await migrate({ ownerUrl: ownerUrl(db) });
    expect(first).toEqual(['001_init.sql', '002_erase_patient_feed.sql']);
    expect(await migrate({ ownerUrl: ownerUrl(db) })).toEqual([]);
  });

  it('are safe to start from several instances at once', async () => {
    const db = await freshDatabase();
    const runs = await Promise.all(Array.from({ length: 4 }, () => migrate({ ownerUrl: ownerUrl(db) })));
    expect(runs.flat()).toEqual(['001_init.sql', '002_erase_patient_feed.sql']); // exactly one of them did the work
  });

  it('create the API role without superuser rights and update its password on rerun', async () => {
    // Roles belong to the whole server, so this uses a role of its own rather than disturbing the one other tests use.
    const db = await freshDatabase();
    const appRole = `kliniki_test_${Math.random().toString(36).slice(2, 8)}`;
    await migrate({ ownerUrl: ownerUrl(db), appRole, appPassword: 'first-password' });
    await migrate({ ownerUrl: ownerUrl(db), appRole, appPassword: "second'password" }); // a quote must not break the DDL
    const app = new pg.Client({ connectionString: `postgres://${appRole}:${encodeURIComponent("second'password")}@127.0.0.1:${port()}/${db}` });
    await app.connect();
    const me = await app.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
    expect(me.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    await app.end();
  });

  it('refuse a role name that is not a plain identifier', async () => {
    await expect(migrate({ ownerUrl: ownerUrl('postgres'), appRole: 'x; DROP TABLE users' })).rejects.toThrow(/Invalid database role name/);
  });

  it('roll a failing migration back completely and say which one failed', async () => {
    const db = await freshDatabase();
    const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE ok_table (id int);');
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE half_done (id int); SELECT * FROM does_not_exist;');
    await expect(migrate({ ownerUrl: ownerUrl(db), dir })).rejects.toThrow(/002_bad\.sql/);

    const check = new pg.Client({ connectionString: ownerUrl(db) });
    await check.connect();
    const tables = (await check.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map((r) => r.tablename);
    expect(tables).toEqual(['ok_table', 'schema_migrations']); // the first stayed, nothing of the second did
    await check.end();
  });
});
