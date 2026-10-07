import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '../src/db';
import { MUTATIONS } from '../src/sync/mutations';
import { MAX_BATCH } from '../src/sync/push';
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

let env: Env;
let admin: Session;

beforeAll(async () => {
  env = await createEnv();
  admin = await registerClinic(env);
});
afterAll(() => env.close());

/** A time-ordered UUID (version 7), the kind a client should generate for ids it creates offline. */
function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe('pushing a batch', () => {
  it('accepts time-ordered (version 7) UUIDs as ids, the kind clients should generate offline', async () => {
    const id = uuidv7();
    expect(id[14]).toBe('7');
    expect((await pushOne(env, admin, mut('patient.create', patientPayload({ id })))).status).toBe('applied');
    expect(await rows(env, 'SELECT 1 FROM patients WHERE id = $1', [id])).toHaveLength(1);
    expect((await pushOne(env, admin, { id: uuidv7(), type: 'service.upsert', payload: { id: uuidv7(), name: 'S', price: 1 } })).status).toBe('applied');
  });

  it('answers every mutation individually, in order, and reports where the feed has got to', async () => {
    const good = patientPayload();
    const res = await push(env, admin, [
      mut('patient.create', good),
      mut('patient.create', patientPayload({ phone: '12345' })), // invalid
      mut('nonsense.type', {}),
      mut('patient.update', { id: good.id, changes: { allergies: 'Penicillin' } }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string; code?: string }) => [r.status, r.code])).toEqual([
      ['applied', undefined],
      ['rejected', 'invalid_payload'],
      ['rejected', 'unknown_type'],
      ['applied', undefined],
    ]);
    expect(res.body.cursor).toBeGreaterThanOrEqual(2);
  });

  it('refuses malformed requests outright rather than half-processing them', async () => {
    expect((await call(env, 'POST', '/v1/sync/push', admin.accessToken, {})).status).toBe(400);
    expect((await call(env, 'POST', '/v1/sync/push', admin.accessToken, { mutations: [] })).status).toBe(400);
    expect((await call(env, 'POST', '/v1/sync/push', admin.accessToken, { mutations: [{ id: 'not-a-uuid', type: 'x', payload: {} }] })).status).toBe(400);
    const tooMany = Array.from({ length: MAX_BATCH + 1 }, () => mut('service.upsert', { id: randomUUID(), name: 'S', price: 1 }));
    expect((await push(env, admin, tooMany)).status).toBe(400);
  });

  it('is the only way in: an unauthenticated push is turned away', async () => {
    expect((await call(env, 'POST', '/v1/sync/push', undefined, { mutations: [mut('service.upsert', { id: randomUUID(), name: 'S', price: 1 })] })).status).toBe(401);
  });

  it('stops at an internal error, leaves nothing recorded, and picks up cleanly when sent again', async () => {
    const real = MUTATIONS['service.upsert'].handler;
    let broken = true;
    MUTATIONS['service.upsert'].handler = async (c, p) => {
      if (broken) throw new Error('simulated outage');
      return real(c, p);
    };
    try {
      const first = mut('patient.create', patientPayload({ name: 'Before the outage' }));
      const failing = mut('service.upsert', { id: randomUUID(), name: 'Breaks', price: 1 });
      const after = mut('patient.create', patientPayload({ name: 'After the outage' }));

      const res = await push(env, admin, [first, failing, after]);
      expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'error', 'skipped']);
      expect(await rows(env, `SELECT 1 FROM applied_mutations WHERE id = ANY($1)`, [[failing.id, after.id]])).toEqual([]); // neither remembered

      broken = false;
      const retry = await push(env, admin, [first, failing, after]);
      expect(retry.body.results.map((r: { status: string; duplicate?: boolean }) => [r.status, !!r.duplicate])).toEqual([
        ['applied', true], // already done: not repeated
        ['applied', false],
        ['applied', false],
      ]);
    } finally {
      MUTATIONS['service.upsert'].handler = real;
    }
  });
});

describe('patients', () => {
  it('keeps both devices\' edits when they changed different fields', async () => {
    const reception = await addStaff(env, admin, 'receptionist');
    const patient = await newPatient(env, admin);
    // Two devices, each offline, each fixing a different field of the same patient.
    await apply(env, admin, mut('patient.update', { id: patient.id, changes: { phone: '0722000111' } }, { offline: true }));
    await apply(env, reception, mut('patient.update', { id: patient.id, changes: { allergies: 'Sulfa' } }, { offline: true }));
    const [row] = await rows(env, 'SELECT phone, allergies FROM patients WHERE id = $1', [patient.id]);
    expect(row).toEqual({ phone: '0722000111', allergies: 'Sulfa' });
  });

  it('applies the later of two edits to the same field, in the order they arrive', async () => {
    const patient = await newPatient(env, admin);
    await apply(env, admin, mut('patient.update', { id: patient.id, changes: { name: 'First Edit' } }));
    await apply(env, admin, mut('patient.update', { id: patient.id, changes: { name: 'Second Edit' } }));
    expect(await rows(env, 'SELECT name FROM patients WHERE id = $1', [patient.id])).toEqual([{ name: 'Second Edit' }]);
  });

  it('applies the app\'s own validation: Kenyan phone, real date, not born in the future, consistent id', async () => {
    const base = patientPayload();
    for (const bad of [{ phone: '12345' }, { phone: '+1 555 123 4567' }, { dob: '2026-02-30' }, { dob: '2027-01-01' }, { dob: '1850-01-01' }, { name: '   ' }, { sex: 'X' }]) {
      const r = await pushOne(env, admin, mut('patient.create', { ...base, id: randomUUID(), ...bad }));
      expect(r.status, JSON.stringify(bad)).toBe('rejected');
    }
    const ok = await pushOne(env, admin, mut('patient.create', { ...base, id: randomUUID(), phone: '0711 222 333' }));
    expect(ok.status).toBe('applied');
    expect(await rows(env, 'SELECT phone FROM patients WHERE id = $1', [ok.data.id])).toEqual([{ phone: '0711222333' }]); // stored without spaces
    expect(await pushOne(env, admin, mut('patient.create', base))).toMatchObject({ status: 'applied' });
    expect(await pushOne(env, admin, mut('patient.create', base))).toMatchObject({ status: 'rejected', code: 'id_taken' }); // a different mutation, same patient id
  });

  it('erases a patient\'s personal details but keeps their bills intact', async () => {
    // Details no other test patient shares, so finding them anywhere afterwards can only mean a leak.
    const patient = await newPatient(env, admin, { name: 'To Be Forgotten', phone: '0755123456', dob: '1971-02-03', sha: 'SHA-ERASE-77', allergies: 'Quinine-ERASE' });
    const bill = await apply(env, admin, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }])));

    expect((await pushOne(env, await addStaff(env, admin, 'receptionist'), mut('patient.erase', { id: patient.id }))).code).toBe('forbidden');
    await apply(env, admin, mut('patient.erase', { id: patient.id }));

    expect(await rows(env, 'SELECT name, phone, sha, allergies, dob::text, erased_at IS NOT NULL AS erased FROM patients WHERE id = $1', [patient.id])).toEqual([
      { name: '[erased]', phone: '', sha: '', allergies: '', dob: '1900-01-01', erased: true },
    ]);
    expect(await rows(env, 'SELECT total FROM bills WHERE number = $1', [bill.number])).toEqual([{ total: 1000 }]); // the financial record stays

    expect(await pushOne(env, admin, mut('patient.update', { id: patient.id, changes: { name: 'Back again' } }))).toMatchObject({ code: 'patient_erased' });
    expect(await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [{ name: 'x', qty: 1, price: 1 }])))).toMatchObject({ code: 'patient_not_found' });

    const feed = await pull(env, admin);
    const last = feed.changes.filter((c) => c.entity === 'patient' && c.id === patient.id).pop()!;
    expect(last.data).toMatchObject({ name: '[erased]', erased: true }); // devices are told to forget

    // Nothing about the person survives anywhere a device (or a database reader) could find it: not in the
    // earlier entries for this patient either, which a new device downloads from the very beginning.
    const everything = JSON.stringify((await pull(env, admin, 0, 1000)).changes);
    for (const secret of ['To Be Forgotten', '0755123456', '1971-02-03', 'SHA-ERASE-77', 'Quinine-ERASE']) {
      expect(everything, secret).not.toContain(secret);
    }
    const stored = (await rows(env, `SELECT data::text AS d FROM changes WHERE entity = 'patient' AND entity_id = $1`, [patient.id])).map((r) => r.d).join();
    for (const secret of ['To Be Forgotten', '0755123456', '1971-02-03', 'SHA-ERASE-77', 'Quinine-ERASE']) expect(stored, secret).not.toContain(secret);
    expect(JSON.stringify(await rows(env, `SELECT * FROM applied_mutations WHERE type LIKE 'patient.%' AND clinic_id = $1`, [admin.clinic.id]))).not.toContain('To Be Forgotten');
  });

  it("also blanks the reasons on the erased patient's visits, in the table and in the feed", async () => {
    const patient = await newPatient(env, admin, { name: 'Visit Person' });
    await apply(env, admin, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date: '2027-05-01', time: '09:00', reason: 'Confidential complaint' }));
    await apply(env, admin, mut('patient.erase', { id: patient.id }));
    expect(await rows(env, 'SELECT reason FROM appointments WHERE patient_id = $1', [patient.id])).toEqual([{ reason: '[erased]' }]);
    expect(JSON.stringify((await pull(env, admin, 0, 1000)).changes)).not.toContain('Confidential complaint');
  });

  it("only ever touches the calling clinic's own feed", async () => {
    const other = await registerClinic(env);
    const theirs = await newPatient(env, other, { name: 'Other Clinic Patient' });
    // Even naming the other clinic's patient id, the scrub function is limited to the caller's clinic.
    await withTenant(env.pool, { clinicId: admin.clinic.id, write: true }, (tx) => tx.query('SELECT scrub_patient_feed($1)', [theirs.id]));
    expect(JSON.stringify((await pull(env, other, 0, 1000)).changes)).toContain('Other Clinic Patient');
  });

  it('is not allowed for roles that cannot edit patients', async () => {
    const pharmacist = await addStaff(env, admin, 'pharmacist');
    expect(await pushOne(env, pharmacist, mut('patient.create', patientPayload()))).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });
});

describe('the queue', () => {
  it('numbers each day from 1, per clinic, and keeps separate days separate', async () => {
    const patient = await newPatient(env, admin);
    const book = (date: string) => apply(env, admin, mut('appointment.book', { id: randomUUID(), patientId: patient.id, date, time: '09:30', reason: 'Fever' }));
    expect((await book('2027-03-01')).queueNo).toBe(1);
    expect((await book('2027-03-01')).queueNo).toBe(2);
    expect((await book('2027-03-02')).queueNo).toBe(1);
  });

  it('only ever moves a patient forward, so a late or repeated update cannot send them back', async () => {
    const patient = await newPatient(env, admin);
    const { id } = { id: randomUUID() };
    await apply(env, admin, mut('appointment.book', { id, patientId: patient.id, date: '2027-04-01', time: '09:00', reason: 'BP review' }));

    expect((await apply(env, admin, mut('appointment.advance', { id, to: 'done' }))).status).toBe('done');
    // A device that was offline then says "call in": the patient is already seen, so nothing changes.
    expect((await apply(env, admin, mut('appointment.advance', { id, to: 'consult' }))).status).toBe('done');
    expect(await rows(env, 'SELECT status FROM appointments WHERE id = $1', [id])).toEqual([{ status: 'done' }]);
    expect(await pushOne(env, admin, mut('appointment.advance', { id: randomUUID(), to: 'done' }))).toMatchObject({ code: 'appointment_not_found' });
  });

  it('checks the patient, the date and the time', async () => {
    const patient = await newPatient(env, admin);
    const base = { id: randomUUID(), patientId: patient.id, date: '2027-04-01', time: '09:00', reason: 'x' };
    for (const bad of [{ date: '2027-02-30' }, { time: '25:00' }, { time: '9:30' }, { reason: '' }]) {
      expect((await pushOne(env, admin, mut('appointment.book', { ...base, id: randomUUID(), ...bad }))).status).toBe('rejected');
    }
    expect(await pushOne(env, admin, mut('appointment.book', { ...base, patientId: randomUUID() }))).toMatchObject({ code: 'patient_not_found' });
  });
});

describe('claims', () => {
  it('moves forward Draft → Submitted → Approved or Rejected, and refuses anything else', async () => {
    const insured = await newPatient(env, admin, { sha: 'SHA-7' });
    const bill = await apply(env, admin, mut('bill.create', billPayload(insured.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }], { method: 'SHA' })));
    const [claim] = await rows(env, 'SELECT id FROM claims WHERE number = $1', [bill.claimNumber]);
    const set = (to: string) => pushOne(env, admin, mut('claim.setStatus', { id: claim.id, to }));

    expect(await set('Approved')).toMatchObject({ status: 'rejected', code: 'invalid_transition' }); // cannot skip Submitted
    expect(await set('Submitted')).toMatchObject({ status: 'applied' });
    expect(await set('Submitted')).toMatchObject({ status: 'applied' }); // saying it again is harmless
    expect(await set('Rejected')).toMatchObject({ status: 'applied' });
    expect(await set('Approved')).toMatchObject({ status: 'rejected', code: 'invalid_transition' }); // decided is final
    expect(await set('Draft')).toMatchObject({ status: 'rejected', code: 'invalid_transition' });
  });

  it('is for administrators and receptionists only', async () => {
    const insured = await newPatient(env, admin, { sha: 'SHA-8' });
    const bill = await apply(env, admin, mut('bill.create', billPayload(insured.id as string, [{ name: 'Consultation', qty: 1, price: 1 }], { method: 'SHA' })));
    const [claim] = await rows(env, 'SELECT id FROM claims WHERE number = $1', [bill.claimNumber]);
    const clinician = await addStaff(env, admin, 'clinician');
    expect(await pushOne(env, clinician, mut('claim.setStatus', { id: claim.id, to: 'Submitted' }))).toMatchObject({ code: 'forbidden' });
  });
});

describe('the formulary', () => {
  it('rejects expired batches, whether on a new drug or a stock receipt', async () => {
    const expired = { id: randomUUID(), no: 'OLD', qty: 5, exp: '2026-10-07' }; // expires today = already expired
    const newDrugResult = await pushOne(env, admin, mut('drug.create', { id: randomUUID(), name: 'X', unit: 'tabs', price: 1, reorder: 0, batch: expired }));
    expect(newDrugResult).toMatchObject({ status: 'rejected', code: 'batch_expired', message: 'This batch has already expired. Check the expiry date.' });

    const drugId = await newDrug(env, admin, [[10, 100]]);
    expect(await pushOne(env, admin, mut('stock.receive', { drugId, batch: expired }))).toMatchObject({ code: 'batch_expired' });
    expect(await pushOne(env, admin, mut('stock.receive', { drugId: randomUUID(), batch: { id: randomUUID(), no: 'N', qty: 1, exp: '2030-01-01' } }))).toMatchObject({ code: 'drug_not_found' });
  });

  it('records receipts in the ledger and shows the drug with its batches to devices', async () => {
    const drugId = await newDrug(env, admin, [[10, 100], [20, 400]]);
    expect(await rows(env, `SELECT reason, sum(delta)::int AS total FROM stock_movements WHERE drug_id = $1 GROUP BY reason`, [drugId])).toEqual([{ reason: 'receipt', total: 30 }]);
    const drug = (await pull(env, admin)).changes.filter((c) => c.entity === 'drug' && c.id === drugId).pop()!.data;
    expect(drug.batches.map((b: { qty: number }) => b.qty)).toEqual([10, 20]); // soonest expiry first
  });

  it('lets pharmacy staff change a price and refuses nonsense', async () => {
    const drugId = await newDrug(env, admin, [[5, 100]]);
    await apply(env, admin, mut('drug.update', { id: drugId, changes: { price: 20 } }));
    expect(await rows(env, 'SELECT price FROM drugs WHERE id = $1', [drugId])).toEqual([{ price: 20 }]);
    expect(await pushOne(env, admin, mut('drug.update', { id: drugId, changes: {} }))).toMatchObject({ code: 'invalid_payload' });
    expect(await pushOne(env, admin, mut('drug.update', { id: drugId, changes: { price: -1 } }))).toMatchObject({ code: 'invalid_payload' });
  });
});

describe('clinic settings', () => {
  it('lets an administrator rename the clinic and tells every device', async () => {
    await apply(env, admin, mut('clinic.rename', { name: '  Tumaini Medical Clinic ' }));
    const clinic = (await pull(env, admin)).changes.filter((c) => c.entity === 'clinic').pop()!.data;
    expect(clinic).toMatchObject({ name: 'Tumaini Medical Clinic' });
    expect(await pushOne(env, admin, mut('clinic.rename', { name: '   ' }))).toMatchObject({ code: 'invalid_payload' });
    expect(await pushOne(env, admin, mut('clinic.rename', { name: 'x'.repeat(81) }))).toMatchObject({ code: 'invalid_payload' });
    const clinician = await addStaff(env, admin, 'clinician');
    expect(await pushOne(env, clinician, mut('clinic.rename', { name: 'Hijack' }))).toMatchObject({ code: 'forbidden' });
  });
});

describe('pulling', () => {
  it('returns changes in order, in pages, and resumes exactly where it left off', async () => {
    const reader = await registerClinic(env);
    for (let i = 0; i < 7; i++) await apply(env, reader, mut('service.upsert', { id: randomUUID(), name: `Service ${i}`, price: i }));

    const seen: number[] = [];
    let cursor = 0;
    let pages = 0;
    for (;;) {
      const page = await pull(env, reader, cursor, 3);
      seen.push(...page.changes.map((c) => c.seq));
      cursor = page.cursor;
      pages++;
      if (!page.more) break;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]); // consecutive, no repeats, none missed

    const idle = await pull(env, reader, cursor);
    expect(idle).toMatchObject({ changes: [], cursor, more: false, head: 7 });
  });

  it('validates its parameters', async () => {
    for (const q of ['cursor=-1', 'cursor=abc', 'limit=0', 'limit=100000']) {
      expect((await call(env, 'GET', `/v1/sync/pull?${q}`, admin.accessToken)).status, q).toBe(400);
    }
  });

  it('logs a full download but not routine incremental pulls', async () => {
    const reader = await registerClinic(env);
    await pull(env, reader, 0);
    await pull(env, reader, 0);
    await pull(env, reader, 5);
    expect(await rows(env, `SELECT 1 FROM audit_log WHERE clinic_id = $1 AND action = 'sync.full_pull'`, [reader.clinic.id])).toHaveLength(2);
  });
});
