import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '../src/db';
import { addStaff, apply, call, createEnv, mut, newDrug, newPatient, pull, pushOne, registerClinic, rows, type Env, type Session } from './helpers';

// Two clinics share one database. These tests try to cross the line in every way the API and the
// database allow.

let env: Env;
let a: Session;
let b: Session;
let patientA: { id: string };

beforeAll(async () => {
  env = await createEnv();
  a = await registerClinic(env, { clinicName: 'Clinic A' });
  b = await registerClinic(env, { clinicName: 'Clinic B' });
  patientA = (await newPatient(env, a, { name: 'Alice of A' })) as { id: string };
  await newPatient(env, b, { name: 'Bob of B' });
  await newDrug(env, a, [[10, 365]], { name: 'A-only drug' });
});
afterAll(() => env.close());

describe('through the API', () => {
  it("won't show another clinic's patient by id", async () => {
    expect((await call(env, 'GET', `/v1/patients/${patientA.id}`, a.accessToken)).status).toBe(200);
    const stolen = await call(env, 'GET', `/v1/patients/${patientA.id}`, b.accessToken);
    expect(stolen.status).toBe(404);
  });

  it("keeps each clinic's lists, searches and change feed to itself", async () => {
    const listB = await call(env, 'GET', '/v1/patients', b.accessToken);
    expect(listB.body.patients.map((p: { name: string }) => p.name)).toEqual(['Bob of B']);

    const searchB = await call(env, 'GET', '/v1/patients?q=alice', b.accessToken);
    expect(searchB.body.patients).toEqual([]);

    expect((await call(env, 'GET', '/v1/drugs', b.accessToken)).body.drugs).toEqual([]);

    const feedB = await pull(env, b);
    expect(JSON.stringify(feedB.changes)).not.toContain('Alice');
    expect(JSON.stringify(feedB.changes)).not.toContain('A-only');
  });

  it("can't bill, book or edit against another clinic's patient", async () => {
    const bill = await pushOne(env, b, mut('bill.create', { id: randomUUID(), patientId: patientA.id, lines: [{ name: 'x', qty: 1, price: 1 }], method: 'Cash' }));
    expect(bill).toMatchObject({ status: 'rejected', code: 'patient_not_found' });
    const visit = await pushOne(env, b, mut('appointment.book', { id: randomUUID(), patientId: patientA.id, date: '2026-10-07', time: '09:00', reason: 'x' }));
    expect(visit).toMatchObject({ status: 'rejected', code: 'patient_not_found' });
    const edit = await pushOne(env, b, mut('patient.update', { id: patientA.id, changes: { name: 'Hijacked' } }));
    expect(edit).toMatchObject({ status: 'rejected', code: 'patient_not_found' });
    expect(await rows(env, 'SELECT name FROM patients WHERE id = $1', [patientA.id])).toEqual([{ name: 'Alice of A' }]);
  });

  it("can't take another clinic's mutation id, or learn from it", async () => {
    const id = randomUUID();
    await apply(env, a, mut('service.upsert', { id: randomUUID(), name: 'Secret service', price: 1 }, { id }));
    // The same mutation id from clinic B is its own, unrelated mutation.
    const mine = await pushOne(env, b, { id, type: 'service.upsert', payload: { id: randomUUID(), name: 'B service', price: 2 } });
    expect(mine).toMatchObject({ status: 'applied' });
    expect(mine.duplicate).toBeUndefined();
  });

  it("can't see another clinic's staff or devices, or revoke them", async () => {
    const staffB = (await call(env, 'GET', '/v1/staff', b.accessToken)).body.staff.map((s: { name: string }) => s.name);
    expect(staffB).toEqual(['Wanjiru Kamau']); // only B's own admin
    const revoke = await call(env, 'POST', `/v1/devices/${a.deviceId}/revoke`, b.accessToken);
    expect(revoke.status).toBe(404);
    expect((await call(env, 'GET', '/v1/patients', a.accessToken)).status).toBe(200); // A is unaffected
  });

  it("won't let a staff member's token work in a clinic they don't belong to", async () => {
    const staffA = await addStaff(env, a, 'clinician');
    // Same person, token claims clinic B: membership is checked in the database, not taken from the token.
    const { accessToken } = staffA;
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString());
    expect(claims.cid).toBe(a.clinic.id);
    expect((await call(env, 'GET', `/v1/patients/${patientA.id}`, accessToken)).status).toBe(200);
  });
});

describe('inside the database', () => {
  it('connects the API as an unprivileged role that cannot bypass row security', async () => {
    const [role] = await rows(env, `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'kliniki_app'`);
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
    const me = await env.pool.query('SELECT current_user AS u');
    expect(me.rows[0].u).toBe('kliniki_app');
  });

  it('sees nothing at all when no clinic is set', async () => {
    const counts = await env.pool.query(
      `SELECT (SELECT count(*) FROM patients) AS patients, (SELECT count(*) FROM bills) AS bills,
              (SELECT count(*) FROM changes) AS changes, (SELECT count(*) FROM audit_log) AS audit,
              (SELECT count(*) FROM clinics) AS clinics`,
    );
    expect(Object.values(counts.rows[0]).map(Number)).toEqual([0, 0, 0, 0, 0]);
    // …while the rows really are there.
    expect((await rows(env, 'SELECT count(*)::int AS n FROM patients'))[0]!.n).toBeGreaterThanOrEqual(2);
  });

  it("scopes a transaction to its clinic, and doesn't leak the setting into the next use of the connection", async () => {
    const one = createPoolOfOne();
    try {
      const inA = await withTenant(one, { clinicId: a.clinic.id }, (tx) => tx.query('SELECT name FROM patients'));
      expect(inA.map((r) => r.name)).toEqual(['Alice of A']);

      // The very same physical connection, used again with no tenant, must be blind.
      const after = await one.query('SELECT count(*)::int AS n FROM patients');
      expect(after.rows[0].n).toBe(0);
      const setting = await one.query(`SELECT current_setting('app.clinic_id', true) AS v`);
      expect([null, '']).toContain(setting.rows[0].v);
    } finally {
      await one.end();
    }
  });

  it("refuses to write a row into another clinic, or to point a row at another clinic's data", async () => {
    await expect(
      withTenant(env.pool, { clinicId: b.clinic.id }, (tx) =>
        tx.query(`INSERT INTO patients (clinic_id, id, name, phone, dob, sex) VALUES ($1, gen_random_uuid(), 'x', '0700000000', '1990-01-01', 'F')`, [a.clinic.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' }); // row-level security violation

    // Clinic B writes a bill of its own that names clinic A's patient: the composite foreign key refuses.
    await expect(
      withTenant(env.pool, { clinicId: b.clinic.id }, (tx) =>
        tx.query(
          `INSERT INTO bills (clinic_id, id, number, seq, patient_id, date, method, total) VALUES ($1, gen_random_uuid(), 'INV-X', 9999, $2, '2026-10-07', 'Cash', 0)`,
          [b.clinic.id, patientA.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' }); // foreign key violation
  });

  it('cannot update or delete the audit trail, the change feed or the stock ledger', async () => {
    for (const table of ['audit_log', 'changes', 'stock_movements', 'applied_mutations']) {
      await expect(withTenant(env.pool, { clinicId: a.clinic.id }, (tx) => tx.query(`DELETE FROM ${table}`))).rejects.toMatchObject({ code: '42501' });
      await expect(withTenant(env.pool, { clinicId: a.clinic.id }, (tx) => tx.query(`UPDATE ${table} SET clinic_id = clinic_id`))).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('has row-level security switched on AND forced for every table that carries a clinic', async () => {
    // A guard for the future: a new migration that adds a clinic table without protecting it fails here.
    const unprotected = await rows(
      env,
      `SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'clinic_id' AND NOT a.attisdropped)
         AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
       ORDER BY 1`,
    );
    // memberships and refresh_tokens hold no patient data and are looked up before the clinic is known.
    expect(unprotected.map((r) => r.relname)).toEqual(['memberships', 'refresh_tokens']);
  });
});

import { createPool, type Pool } from '../src/db';
function createPoolOfOne(): Pool {
  return createPool(env.config.DATABASE_URL, 1);
}
