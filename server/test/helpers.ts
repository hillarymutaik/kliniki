import { randomBytes, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { inject } from 'vitest';

import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { createPool, type Pool } from '../src/db';
import { APP_PASSWORD, SUPERUSER_PASSWORD } from './global-setup';

/** 10:00 EAT on a Wednesday. Tests move this clock instead of reading the real one. */
export const NOW = new Date('2026-10-07T07:00:00Z');
export const TODAY = '2026-10-07';

export interface Env {
  app: FastifyInstance;
  /** The API's own connection: the unprivileged role, subject to row-level security. */
  pool: Pool;
  /** A superuser connection for looking at what is really in the tables. Tests only. */
  owner: Pool;
  config: Config;
  /** The server's idea of the current time; assign to move it. */
  clock: { now: Date };
  close(): Promise<void>;
}

export async function createEnv(overrides: Record<string, string> = {}): Promise<Env> {
  const port = inject('pgPort');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const url = (user: string, password: string) => `postgres://${user}:${password}@127.0.0.1:${port}/${name}`;

  const admin = new pg.Client({ connectionString: `postgres://postgres:${SUPERUSER_PASSWORD}@127.0.0.1:${port}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template_kliniki`);
  await admin.end();

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: url('kliniki_app', APP_PASSWORD),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    LOG_LEVEL: process.env.TEST_LOG ? 'error' : 'silent',
    DB_LOCK_TIMEOUT_MS: '1500',
    // Every test registers clinics from the same address.
    RATE_LIMIT_REGISTER_PER_HOUR: '100000',
    ...overrides,
  });
  const pool = createPool(config.DATABASE_URL, config.DB_POOL_MAX, config.DB_CONNECT_TIMEOUT_MS);
  const owner = createPool(url('postgres', SUPERUSER_PASSWORD), 4);
  const clock = { now: NOW };
  const app = await buildApp({ config, pool, now: () => clock.now });
  await app.ready();

  return {
    app,
    pool,
    owner,
    config,
    clock,
    async close() {
      await app.close();
      await pool.end();
      await owner.end();
    },
  };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  clinic: { id: string; name: string };
  user: { id: string; name: string; role: string };
  deviceId: string;
}

let counter = 0;
/** A unique, valid Kenyan mobile number. */
export const phone = () => `07${String(10_000_000 + ++counter * 7).slice(-8)}`;

export const PASSWORD = 'correct horse battery';

export async function call(env: Env, method: 'GET' | 'POST' | 'PATCH', url: string, token?: string, body?: unknown) {
  const res = await env.app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { payload: body as object }),
  });
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as any) : undefined };
}

export async function registerClinic(env: Env, overrides: Record<string, unknown> = {}): Promise<Session> {
  const res = await call(env, 'POST', '/v1/auth/register', undefined, {
    clinicName: 'Afya Bora Medical Centre',
    adminName: 'Wanjiru Kamau',
    login: phone(),
    password: PASSWORD,
    device: { id: randomUUID(), name: 'Front desk tablet' },
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Adds a staff member through the API and signs them in on a new device. */
export async function addStaff(env: Env, admin: Session, role: string, name = `${role} user`): Promise<Session> {
  const login = phone();
  const created = await call(env, 'POST', '/v1/staff', admin.accessToken, { name, login, password: PASSWORD, role });
  if (created.status !== 201) throw new Error(`add staff failed: ${created.status} ${JSON.stringify(created.body)}`);
  const signedIn = await call(env, 'POST', '/v1/auth/login', undefined, {
    login,
    password: PASSWORD,
    device: { id: randomUUID(), name: `${name} phone` },
  });
  if (signedIn.status !== 200) throw new Error(`login failed: ${signedIn.status} ${JSON.stringify(signedIn.body)}`);
  return signedIn.body;
}

// ---------------------------------------------------------------- mutations

export interface Mutation {
  id: string;
  type: string;
  payload: unknown;
  offline?: boolean;
  createdAt?: string;
}

export const mut = (type: string, payload: unknown, extra: Partial<Mutation> = {}): Mutation => ({
  id: randomUUID(),
  type,
  payload,
  ...extra,
});

export async function push(env: Env, session: Session, mutations: Mutation[]) {
  return call(env, 'POST', '/v1/sync/push', session.accessToken, { mutations });
}

/** Pushes one mutation and returns its result, failing the test if the request itself failed. */
export async function pushOne(env: Env, session: Session, mutation: Mutation) {
  const res = await push(env, session, [mutation]);
  if (res.status !== 200) throw new Error(`push failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.results[0] as { id: string; status: string; data?: any; code?: string; message?: string; duplicate?: boolean };
}

/** Like pushOne but the mutation must be applied. */
export async function apply(env: Env, session: Session, mutation: Mutation) {
  const result = await pushOne(env, session, mutation);
  if (result.status !== 'applied') throw new Error(`${mutation.type} was ${result.status}: ${result.code} ${result.message}`);
  return result.data;
}

export async function pull(env: Env, session: Session, cursor = 0, limit = 500) {
  const res = await call(env, 'GET', `/v1/sync/pull?cursor=${cursor}&limit=${limit}`, session.accessToken);
  if (res.status !== 200) throw new Error(`pull failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { changes: { seq: number; entity: string; id: string; op: string; data: any }[]; cursor: number; more: boolean; head: number };
}

// ---------------------------------------------------------------- common fixtures

export const patientPayload = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: 'Njeri Mwangi',
  phone: '0711222333',
  dob: '1990-06-15',
  sex: 'F',
  sha: '',
  allergies: '',
  ...overrides,
});

export async function newPatient(env: Env, session: Session, overrides: Record<string, unknown> = {}) {
  const payload = patientPayload(overrides);
  await apply(env, session, mut('patient.create', payload));
  return payload;
}

/** A drug with one batch per entry in `batches`, each [quantity, days until expiry]. */
export async function newDrug(
  env: Env,
  session: Session,
  batches: [number, number][] = [[10, 365]],
  overrides: Record<string, unknown> = {},
) {
  const id = randomUUID();
  const expiry = (days: number) => new Date(NOW.getTime() + 3 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
  const [first, ...rest] = batches;
  await apply(
    env,
    session,
    mut('drug.create', {
      id,
      name: 'Amoxicillin 500mg caps',
      unit: 'caps',
      price: 15,
      reorder: 5,
      ...(first ? { batch: { id: randomUUID(), no: 'B1', qty: first[0], exp: expiry(first[1]) } } : {}),
      ...overrides,
    }),
  );
  for (const [i, [qty, days]] of rest.entries()) {
    await apply(env, session, mut('stock.receive', { drugId: id, batch: { id: randomUUID(), no: `B${i + 2}`, qty, exp: expiry(days) } }));
  }
  return id;
}

export const billPayload = (patientId: string, lines: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  patientId,
  lines,
  method: 'Cash',
  ...overrides,
});

export const mpesaCode = () => randomBytes(5).toString('hex').toUpperCase();

/** Reads straight from the tables as the superuser, bypassing row-level security. */
export async function rows<T = any>(env: Env, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await env.owner.query(sql, params)).rows as T[];
}
