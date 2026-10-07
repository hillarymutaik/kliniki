import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '../src/db';
import { emit } from '../src/sync/changes';
import {
  addStaff,
  apply,
  billPayload,
  call,
  createEnv,
  mut,
  newDrug,
  newPatient,
  patientPayload,
  pull,
  push,
  pushOne,
  registerClinic,
  rows,
  type Env,
  type Session,
} from './helpers';

// Everything here fires requests at the same moment against one real database, which is where
// double-selling stock, duplicate invoice numbers and a lossy sync feed would show up.

let env: Env;
let admin: Session;
let second: Session; // a second device in the same clinic

beforeAll(async () => {
  // A realistic lock timeout: these tests queue dozens of writers on purpose and none should be turned away.
  env = await createEnv({ DB_LOCK_TIMEOUT_MS: '10000' });
  admin = await registerClinic(env);
  second = await addStaff(env, admin, 'receptionist');
});
afterAll(() => env.close());

const line = (drugId: string, qty = 1) => ({ name: 'Amoxicillin 500mg caps', qty, price: 15, drugId });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('selling the last stock from several devices at once', () => {
  it('lets exactly as many sales through as there are units, and never goes negative online', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[3, 365]]);

    const attempts = Array.from({ length: 12 }, (_, i) =>
      pushOne(env, i % 2 ? admin : second, mut('bill.create', billPayload(patient.id as string, [line(drugId)]))),
    );
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.status === 'applied')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected' && r.code === 'insufficient_stock')).toHaveLength(9);
    expect(await rows(env, 'SELECT qty FROM stock_batches WHERE drug_id = $1', [drugId])).toEqual([{ qty: 0 }]);

    const ledger = await rows(env, `SELECT sum(delta)::int AS total, count(*)::int AS n FROM stock_movements WHERE drug_id = $1`, [drugId]);
    expect(ledger).toEqual([{ total: 0, n: 4 }]); // one receipt of +3 and three dispenses of -1
  });

  it('handles a multi-drug bill racing a single-drug bill without deadlocking or double-selling', async () => {
    const patient = await newPatient(env, admin);
    const a = await newDrug(env, admin, [[5, 365]], { name: 'Drug A' });
    const b = await newDrug(env, admin, [[5, 365]], { name: 'Drug B' });

    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [line(a), line(b)])))),
      ...Array.from({ length: 5 }, () => pushOne(env, second, mut('bill.create', billPayload(patient.id as string, [line(b), line(a)])))),
    ]);

    expect(results.filter((r) => r.status === 'applied')).toHaveLength(5); // 5 units of each, one of each per bill
    const left = await rows(env, 'SELECT drug_id, qty FROM stock_batches WHERE drug_id = ANY($1)', [[a, b]]);
    expect(left.map((r) => r.qty)).toEqual([0, 0]);
  });
});

describe('document numbers', () => {
  it('never repeats or skips an invoice number across devices', async () => {
    const patient = await newPatient(env, admin);
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        pushOne(env, i % 2 ? admin : second, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }]))),
      ),
    );
    expect(results.every((r) => r.status === 'applied')).toBe(true);

    const numbers = (await rows<{ seq: number }>(env, 'SELECT seq FROM bills ORDER BY seq')).map((r) => r.seq);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1)); // 1..N, gap-free
  });

  it('gives every patient booked at the same moment a different queue number, starting at 1', async () => {
    const patient = await newPatient(env, admin);
    const date = '2026-12-01';
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        pushOne(env, i % 2 ? admin : second, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date, time: '09:00', reason: 'Visit' })),
      ),
    );
    const queue = results.map((r) => r.data.queueNo as number).sort((x, y) => x - y);
    expect(queue).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('the same change arriving more than once', () => {
  it('is applied once however many times and however concurrently it is sent', async () => {
    const patient = await newPatient(env, admin);
    const billId = randomUUID();
    const same = mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }], { id: billId }));
    const before = await rows(env, 'SELECT count(*)::int AS n FROM bills');

    const results = await Promise.all(Array.from({ length: 8 }, () => pushOne(env, admin, same)));

    expect(results.filter((r) => !r.duplicate)).toHaveLength(1); // one real application…
    expect(new Set(results.map((r) => r.data.number)).size).toBe(1); // …and everyone is told the same answer
    expect((await rows<{ n: number }>(env, 'SELECT count(*)::int AS n FROM bills'))[0]!.n).toBe(before[0]!.n + 1);
  });

  it('replays a rejection too, rather than trying again', async () => {
    const bad = mut('bill.create', billPayload(randomUUID(), [{ name: 'x', qty: 1, price: 1 }]));
    const first = await pushOne(env, admin, bad);
    const again = await pushOne(env, admin, bad);
    expect(first).toMatchObject({ status: 'rejected', code: 'patient_not_found' });
    expect(again).toMatchObject({ status: 'rejected', code: 'patient_not_found', duplicate: true });
  });
});

describe('the change feed while writes are in flight', () => {
  it('queues a second writer behind an open transaction, and a pull in between sees only what is committed', async () => {
    const start = await pull(env, admin);
    const clinicId = admin.clinic.id;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Writer A claims change number N+1 and holds its transaction open.
    const writerA = withTenant(env.pool, { clinicId, write: true }, async (tx) => {
      await emit(tx, clinicId, 'note', 'a', 'upsert', { who: 'A' });
      await gate;
    });
    await delay(150);

    // Writer B arrives meanwhile. It must wait for A rather than take its own number and commit first.
    const writerB = push(env, admin, [mut('patient.create', patientPayload())]);
    const raced = await Promise.race([writerB.then(() => 'finished'), delay(500).then(() => 'waiting')]);
    expect(raced).toBe('waiting');

    // A reader in the middle sees none of the uncommitted work.
    const middle = await pull(env, admin, start.cursor);
    expect(middle.changes).toEqual([]);

    release();
    await writerA;
    expect((await writerB).status).toBe(200);

    // Afterwards the numbers are consecutive and in commit order: nothing was stepped over.
    const after = await pull(env, admin, start.cursor);
    expect(after.changes.map((c) => c.seq)).toEqual([start.cursor + 1, start.cursor + 2]);
    expect(after.changes.map((c) => c.entity)).toEqual(['note', 'patient']);
  });

  it('turns a writer away with "busy" if the clinic stays locked too long, rather than hanging', async () => {
    // Its own server with a short lock timeout, so the wait is brief.
    const impatient = await createEnv({ DB_LOCK_TIMEOUT_MS: '400' });
    try {
      const owner = await registerClinic(impatient);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const holder = withTenant(impatient.pool, { clinicId: owner.clinic.id, write: true }, () => gate);
      await delay(100);

      const res = await push(impatient, owner, [mut('patient.create', patientPayload())]);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('busy');
      expect(res.body.results).toBeUndefined(); // nothing was half-applied

      release();
      await holder;
      expect((await push(impatient, owner, [mut('patient.create', patientPayload())])).status).toBe(200); // recovers at once
    } finally {
      await impatient.close();
    }
  });

  it('lets reads proceed while a write holds the clinic lock', async () => {
    const clinicId = admin.clinic.id;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const holder = withTenant(env.pool, { clinicId, write: true }, () => gate);
    await delay(100);

    const started = Date.now();
    const list = await call(env, 'GET', '/v1/drugs', admin.accessToken);
    expect(list.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);

    release();
    await holder;
  });
});

describe('clinics do not slow each other down', () => {
  it('lets two clinics write at the same time while one clinic holds its lock', async () => {
    const other = await registerClinic(env);
    const clinicId = admin.clinic.id;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const holder = withTenant(env.pool, { clinicId, write: true }, () => gate);
    await delay(100);

    const res = await apply(env, other, mut('patient.create', patientPayload())); // would time out if clinics shared a lock
    expect(res).toBeTruthy();

    release();
    await holder;
  });
});

describe('when the service is overloaded', () => {
  it('tells devices to retry (503), not that something is broken, when no database connection is free', async () => {
    // One connection in the pool, held by someone else, and a short wait for a free one.
    const starved = await createEnv({ DB_POOL_MAX: '1', DB_CONNECT_TIMEOUT_MS: '300' });
    try {
      const owner = await registerClinic(starved);
      const held = await starved.pool.connect();
      try {
        const res = await call(starved, 'GET', '/v1/me', owner.accessToken);
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('unavailable');
        const pushed = await push(starved, owner, [mut('patient.create', patientPayload())]);
        expect(pushed.status).toBe(503);
      } finally {
        held.release();
      }
      expect((await call(starved, 'GET', '/v1/me', owner.accessToken)).status).toBe(200); // recovers as soon as a connection frees up
    } finally {
      await starved.close();
    }
  });
});
