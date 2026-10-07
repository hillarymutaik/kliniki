import { z } from 'zod';

import { billTotal } from '@domain/billing';
import { CLINIC_NAME_MAX } from '@domain/clinic';
import { isValidDate, isValidTime } from '@domain/dates';
import { allocateFefo } from '@domain/stock';
import { nextClaimStatuses } from '@domain/claims';
import { isValidKenyanPhone, isValidMpesaCode, padNumber, stripWhitespace } from '@domain/validation';

import type { Tx } from '../db';
import type { Permission, Role } from '../permissions';
import { nextCounter } from './changes';
import { publish } from './entities';

/** A mutation that cannot be applied, and never will be: the device should drop it and tell the user. */
export class Reject extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface MutationCtx {
  tx: Tx;
  clinicId: string;
  userId: string;
  deviceId: string;
  role: Role;
  /** The calendar day (EAT) the change happened on: when the device made it, not when it reached the server. */
  date: string;
  /** Made on a device that was offline. Such sales have already happened, so they are never refused for lack of stock. */
  offline: boolean;
}

// ---------------------------------------------------------------- field rules

const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.number().int().min(0).max(10_000_000);
const whole = z.number().int().min(1).max(100_000);
const day = z.string().refine(isValidDate, 'Use YYYY-MM-DD.');

const patientFields = {
  name: text(80),
  phone: z
    .string()
    .refine(isValidKenyanPhone, 'Enter a valid Kenyan phone number, e.g. 0712345678.')
    .transform(stripWhitespace),
  dob: day.refine((d) => d >= '1900-01-01', 'Enter a valid date of birth.'),
  sex: z.enum(['F', 'M']),
  sha: z.string().trim().max(40),
  allergies: z.string().trim().max(200),
};

const batch = z.object({ id, no: text(40), qty: whole, exp: day });
type Batch = z.infer<typeof batch>;

const atLeastOne = (changes: object) => Object.keys(changes).length > 0;

// ---------------------------------------------------------------- shared steps

async function requirePatient(c: MutationCtx, patientId: string) {
  const patient = await c.tx.one<{ sha: string; erased_at: string | null }>(
    'SELECT sha, erased_at FROM patients WHERE clinic_id = $1 AND id = $2',
    [c.clinicId, patientId],
  );
  if (!patient || patient.erased_at) throw new Reject('patient_not_found', 'That patient is not registered.');
  return patient;
}

async function requireDrug(c: MutationCtx, drugId: string) {
  const drug = await c.tx.one<{ name: string; unit: string }>('SELECT name, unit FROM drugs WHERE clinic_id = $1 AND id = $2', [
    c.clinicId,
    drugId,
  ]);
  if (!drug) throw new Reject('drug_not_found', 'That drug is not in the formulary.');
  return drug;
}

async function receiveBatch(c: MutationCtx, drugId: string, b: Batch) {
  if (b.exp <= c.date) throw new Reject('batch_expired', 'This batch has already expired. Check the expiry date.');
  if (await c.tx.one('SELECT 1 FROM stock_batches WHERE clinic_id = $1 AND id = $2', [c.clinicId, b.id])) {
    throw new Reject('id_taken', 'That batch id is already in use.');
  }
  await c.tx.query('INSERT INTO stock_batches (clinic_id, id, drug_id, batch_no, exp, qty) VALUES ($1, $2, $3, $4, $5, $6)', [
    c.clinicId,
    b.id,
    drugId,
    b.no,
    b.exp,
    b.qty,
  ]);
  await c.tx.query(
    `INSERT INTO stock_movements (clinic_id, drug_id, batch_id, delta, reason, created_by) VALUES ($1, $2, $3, $4, 'receipt', $5)`,
    [c.clinicId, drugId, b.id, b.qty, c.userId],
  );
}

/** Builds `SET a = $3, b = $4` from the fields a change actually names, against a fixed list of columns. */
function setClause(changes: Record<string, unknown>, columns: Record<string, string>, firstParam: number) {
  const names = Object.keys(changes).filter((key) => key in columns);
  return {
    sql: names.map((key, i) => `${columns[key]} = $${firstParam + i}`).join(', '),
    params: names.map((key) => changes[key]),
  };
}

const STATUS_RANK = { waiting: 0, consult: 1, done: 2 } as const;

// ---------------------------------------------------------------- the mutations

function define<S extends z.ZodType>(permission: Permission, schema: S, handler: (c: MutationCtx, p: z.infer<S>) => Promise<unknown>) {
  return { permission, schema, handler: handler as (c: MutationCtx, p: unknown) => Promise<unknown> };
}

export const MUTATIONS = {
  'clinic.rename': define('clinic.manage', z.object({ name: text(CLINIC_NAME_MAX) }), async (c, p) => {
    await c.tx.query('UPDATE clinics SET name = $2 WHERE id = $1', [c.clinicId, p.name]);
    await publish(c.tx, c.clinicId, 'clinic', c.clinicId);
    return { name: p.name };
  }),

  'patient.create': define('patients.write', z.object({ id, ...patientFields }), async (c, p) => {
    if (p.dob > c.date) throw new Reject('invalid_dob', 'Date of birth cannot be in the future.');
    if (await c.tx.one('SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2', [c.clinicId, p.id])) {
      throw new Reject('id_taken', 'That patient id is already in use.');
    }
    await c.tx.query(
      `INSERT INTO patients (clinic_id, id, name, phone, dob, sex, sha, allergies, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [c.clinicId, p.id, p.name, p.phone, p.dob, p.sex, p.sha, p.allergies, c.userId],
    );
    await publish(c.tx, c.clinicId, 'patient', p.id);
    return { id: p.id };
  }),

  // Field by field, in the order changes arrive: two devices editing different fields both keep their edit.
  'patient.update': define(
    'patients.write',
    z.object({
      id,
      changes: z.object(patientFields).partial().refine(atLeastOne, 'Name at least one field to change.'),
    }),
    async (c, p) => {
      if (p.changes.dob && p.changes.dob > c.date) throw new Reject('invalid_dob', 'Date of birth cannot be in the future.');
      const current = await c.tx.one<{ erased_at: string | null }>(
        'SELECT erased_at FROM patients WHERE clinic_id = $1 AND id = $2 FOR UPDATE',
        [c.clinicId, p.id],
      );
      if (!current) throw new Reject('patient_not_found', 'That patient is not registered.');
      if (current.erased_at) throw new Reject('patient_erased', 'This patient record has been erased.');
      const set = setClause(p.changes, { name: 'name', phone: 'phone', dob: 'dob', sex: 'sex', sha: 'sha', allergies: 'allergies' }, 3);
      await c.tx.query(`UPDATE patients SET ${set.sql}, updated_at = now() WHERE clinic_id = $1 AND id = $2`, [
        c.clinicId,
        p.id,
        ...set.params,
      ]);
      await publish(c.tx, c.clinicId, 'patient', p.id);
      return { id: p.id };
    },
  ),

  // Right to erasure: personal details are blanked but the row stays, so bills and claims that refer to
  // it (financial records the clinic must keep) remain intact and attributable to "an erased patient".
  // The details are also removed from everywhere they were copied: earlier change-feed entries (a new
  // device downloads the whole feed) and the free-text reasons on the patient's visits.
  'patient.erase': define('patients.erase', z.object({ id }), async (c, p) => {
    const done = await c.tx.one(
      `UPDATE patients SET name = '[erased]', phone = '', dob = '1900-01-01', sha = '', allergies = '',
         erased_at = COALESCE(erased_at, now()), updated_at = now()
       WHERE clinic_id = $1 AND id = $2 RETURNING id`,
      [c.clinicId, p.id],
    );
    if (!done) throw new Reject('patient_not_found', 'That patient is not registered.');

    const visits = await c.tx.query<{ id: string }>(
      `UPDATE appointments SET reason = '[erased]', updated_at = now()
       WHERE clinic_id = $1 AND patient_id = $2 AND reason <> '[erased]' RETURNING id`,
      [c.clinicId, p.id],
    );
    await c.tx.query('SELECT scrub_patient_feed($1)', [p.id]);

    // Tell devices the new state, so what they hold locally is overwritten too.
    for (const visit of visits) await publish(c.tx, c.clinicId, 'appointment', visit.id);
    await publish(c.tx, c.clinicId, 'patient', p.id);
    return { id: p.id };
  }),

  'service.upsert': define('pharmacy.write', z.object({ id, name: text(80), price: money }), async (c, p) => {
    await c.tx.query(
      `INSERT INTO services (clinic_id, id, name, price) VALUES ($1, $2, $3, $4)
       ON CONFLICT (clinic_id, id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, updated_at = now()`,
      [c.clinicId, p.id, p.name, p.price],
    );
    await publish(c.tx, c.clinicId, 'service', p.id);
    return { id: p.id };
  }),

  'drug.create': define(
    'pharmacy.write',
    z.object({ id, name: text(120), unit: text(20), price: money, reorder: z.number().int().min(0).max(1_000_000), batch: batch.optional() }),
    async (c, p) => {
      if (await c.tx.one('SELECT 1 FROM drugs WHERE clinic_id = $1 AND id = $2', [c.clinicId, p.id])) {
        throw new Reject('id_taken', 'That drug id is already in use.');
      }
      await c.tx.query('INSERT INTO drugs (clinic_id, id, name, unit, price, reorder) VALUES ($1, $2, $3, $4, $5, $6)', [
        c.clinicId,
        p.id,
        p.name,
        p.unit,
        p.price,
        p.reorder,
      ]);
      if (p.batch) await receiveBatch(c, p.id, p.batch);
      await publish(c.tx, c.clinicId, 'drug', p.id);
      return { id: p.id };
    },
  ),

  'drug.update': define(
    'pharmacy.write',
    z.object({
      id,
      changes: z
        .object({ name: text(120), unit: text(20), price: money, reorder: z.number().int().min(0).max(1_000_000) })
        .partial()
        .refine(atLeastOne, 'Name at least one field to change.'),
    }),
    async (c, p) => {
      await requireDrug(c, p.id);
      const set = setClause(p.changes, { name: 'name', unit: 'unit', price: 'price', reorder: 'reorder' }, 3);
      await c.tx.query(`UPDATE drugs SET ${set.sql}, updated_at = now() WHERE clinic_id = $1 AND id = $2`, [c.clinicId, p.id, ...set.params]);
      await publish(c.tx, c.clinicId, 'drug', p.id);
      return { id: p.id };
    },
  ),

  'stock.receive': define('pharmacy.write', z.object({ drugId: id, batch }), async (c, p) => {
    await requireDrug(c, p.drugId);
    await receiveBatch(c, p.drugId, p.batch);
    await publish(c.tx, c.clinicId, 'drug', p.drugId);
    return { batchId: p.batch.id };
  }),

  'appointment.book': define(
    'appointments.write',
    z.object({ id, patientId: id, date: day, time: z.string().refine(isValidTime, 'Use HH:MM.'), reason: text(120) }),
    async (c, p) => {
      await requirePatient(c, p.patientId);
      if (await c.tx.one('SELECT 1 FROM appointments WHERE clinic_id = $1 AND id = $2', [c.clinicId, p.id])) {
        throw new Reject('id_taken', 'That appointment id is already in use.');
      }
      // Each day's queue starts at 1 and the server hands the numbers out, so two reception desks that
      // were offline together can never give two patients the same number.
      const queueNo = await nextCounter(c.tx, c.clinicId, `queue:${p.date}`);
      await c.tx.query(
        `INSERT INTO appointments (clinic_id, id, patient_id, date, time, reason, status, queue_no)
         VALUES ($1, $2, $3, $4, $5, $6, 'waiting', $7)`,
        [c.clinicId, p.id, p.patientId, p.date, p.time, p.reason, queueNo],
      );
      await publish(c.tx, c.clinicId, 'appointment', p.id);
      return { id: p.id, queueNo };
    },
  ),

  // Names the step to reach rather than "the next step": a replay or a second device saying the same
  // thing changes nothing, and a patient already further along is never sent backwards.
  'appointment.advance': define('appointments.write', z.object({ id, to: z.enum(['consult', 'done']) }), async (c, p) => {
    const current = await c.tx.one<{ status: keyof typeof STATUS_RANK }>(
      'SELECT status FROM appointments WHERE clinic_id = $1 AND id = $2 FOR UPDATE',
      [c.clinicId, p.id],
    );
    if (!current) throw new Reject('appointment_not_found', 'That appointment does not exist.');
    if (STATUS_RANK[p.to] <= STATUS_RANK[current.status]) return { status: current.status };
    await c.tx.query(`UPDATE appointments SET status = $3, updated_at = now() WHERE clinic_id = $1 AND id = $2`, [c.clinicId, p.id, p.to]);
    await publish(c.tx, c.clinicId, 'appointment', p.id);
    return { status: p.to };
  }),

  'claim.setStatus': define(
    'claims.update',
    z.object({ id, to: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected']) }),
    async (c, p) => {
      const current = await c.tx.one<{ status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' }>(
        'SELECT status FROM claims WHERE clinic_id = $1 AND id = $2 FOR UPDATE',
        [c.clinicId, p.id],
      );
      if (!current) throw new Reject('claim_not_found', 'That claim does not exist.');
      if (current.status === p.to) return { status: current.status };
      if (!nextClaimStatuses(current.status).includes(p.to)) {
        throw new Reject('invalid_transition', `A claim that is ${current.status.toLowerCase()} cannot be marked ${p.to.toLowerCase()}.`);
      }
      await c.tx.query(`UPDATE claims SET status = $3, updated_at = now() WHERE clinic_id = $1 AND id = $2`, [c.clinicId, p.id, p.to]);
      await publish(c.tx, c.clinicId, 'claim', p.id);
      return { status: p.to };
    },
  ),

  'bill.create': define(
    'bills.create',
    z.object({
      id,
      patientId: id,
      lines: z
        .array(z.object({ name: text(120), qty: whole, price: money, drugId: id.optional() }))
        .min(1, 'Add at least one service or drug.')
        .max(50),
      method: z.enum(['M-Pesa', 'Cash', 'SHA']),
      ref: z.string().trim().max(20).default(''),
    }),
    createBill,
  ),
} as const;

export type MutationType = keyof typeof MUTATIONS;
export const isMutationType = (value: string): value is MutationType => Object.hasOwn(MUTATIONS, value);

// ---------------------------------------------------------------- billing

type BillInput = {
  id: string;
  patientId: string;
  lines: { name: string; qty: number; price: number; drugId?: string }[];
  method: 'M-Pesa' | 'Cash' | 'SHA';
  ref: string;
};

type BatchRow = { id: string; qty: number; exp: string };

/**
 * Saves a bill, draws the stock down first-expiry-first-out, numbers it, and drafts the SHA claim, all in
 * the caller's transaction (which already holds the clinic's lock, so nobody else is selling meanwhile).
 */
async function createBill(c: MutationCtx, p: BillInput) {
  const { tx, clinicId } = c;
  const patient = await requirePatient(c, p.patientId);

  let ref = '';
  if (p.method === 'M-Pesa') {
    if (!isValidMpesaCode(p.ref)) throw new Reject('invalid_mpesa_ref', 'Enter the 10-character M-Pesa confirmation code.');
    ref = p.ref.toUpperCase();
    if (await tx.one(`SELECT 1 FROM bills WHERE clinic_id = $1 AND method = 'M-Pesa' AND ref = $2`, [clinicId, ref])) {
      throw new Reject('duplicate_mpesa_ref', 'That M-Pesa code has already been used on another bill.');
    }
  }
  if (p.method === 'SHA' && !patient.sha) {
    throw new Reject('sha_number_required', 'This patient has no SHA number. Add it on their profile or choose another payment method.');
  }
  if (await tx.one('SELECT 1 FROM bills WHERE clinic_id = $1 AND id = $2', [clinicId, p.id])) {
    throw new Reject('id_taken', 'That bill id is already in use.');
  }

  // Total quantity wanted per drug, drugs in a fixed order.
  const wanted = new Map<string, number>();
  for (const line of p.lines) if (line.drugId) wanted.set(line.drugId, (wanted.get(line.drugId) ?? 0) + line.qty);

  const deltas = new Map<string, number>(); // batch id -> change in qty
  const movements: { drugId: string; batchId: string; delta: number; oversold: boolean }[] = [];
  const oversold: { drugId: string; name: string; short: number }[] = [];
  const touched = new Set<string>();

  for (const drugId of [...wanted.keys()].sort()) {
    const qty = wanted.get(drugId)!;
    const drug = await requireDrug(c, drugId);
    const batches = await tx.query<BatchRow>(
      'SELECT id, qty, exp FROM stock_batches WHERE clinic_id = $1 AND drug_id = $2 ORDER BY exp, created_at, id FOR UPDATE',
      [clinicId, drugId],
    );
    const plan = allocateFefo(batches, qty, c.date);

    if (plan.shortfall > 0 && !c.offline) {
      throw new Reject('insufficient_stock', `Only ${qty - plan.shortfall} ${drug.unit} of ${drug.name} in stock.`, {
        drugId,
        available: qty - plan.shortfall,
      });
    }

    for (const { batch: b, take } of plan.takes) {
      deltas.set(b.id, (deltas.get(b.id) ?? 0) - take);
      movements.push({ drugId, batchId: b.id, delta: -take, oversold: false });
    }

    if (plan.shortfall > 0) {
      // The tablets were handed over, so the sale stands. The shortfall is booked against the batch
      // that would have been used next and flagged, for staff to reconcile against the shelf.
      const target =
        batches.find((b) => b.exp > c.date) ??
        (await createUntrackedBatch(c, drugId));
      deltas.set(target.id, (deltas.get(target.id) ?? 0) - plan.shortfall);
      movements.push({ drugId, batchId: target.id, delta: -plan.shortfall, oversold: true });
      oversold.push({ drugId, name: drug.name, short: plan.shortfall });
    }
    touched.add(drugId);
  }

  const total = billTotal(p.lines);
  const billSeq = await nextCounter(tx, clinicId, 'inv');
  const number = `INV-${padNumber(billSeq)}`;
  await tx.query(
    `INSERT INTO bills (clinic_id, id, number, seq, patient_id, date, method, ref, total, device_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [clinicId, p.id, number, billSeq, p.patientId, c.date, p.method, ref, total, c.deviceId, c.userId],
  );
  await tx.query(
    `INSERT INTO bill_lines (clinic_id, bill_id, line_no, name, qty, price, drug_id)
     SELECT $1::uuid, $2::uuid, (ordinality - 1)::smallint, name, qty, price, drug_id
     FROM unnest($3::text[], $4::int[], $5::int[], $6::uuid[]) WITH ORDINALITY AS l(name, qty, price, drug_id, ordinality)`,
    [clinicId, p.id, p.lines.map((l) => l.name), p.lines.map((l) => l.qty), p.lines.map((l) => l.price), p.lines.map((l) => l.drugId ?? null)],
  );

  for (const [batchId, delta] of deltas) {
    await tx.query('UPDATE stock_batches SET qty = qty + $3 WHERE clinic_id = $1 AND id = $2', [clinicId, batchId, delta]);
  }
  for (const m of movements) {
    await tx.query(
      `INSERT INTO stock_movements (clinic_id, drug_id, batch_id, delta, reason, bill_id, oversold, created_by)
       VALUES ($1, $2, $3, $4, 'dispense', $5, $6, $7)`,
      [clinicId, m.drugId, m.batchId, m.delta, p.id, m.oversold, c.userId],
    );
  }

  let claimNumber: string | undefined;
  let claimId: string | undefined;
  if (p.method === 'SHA') {
    const claimSeq = await nextCounter(tx, clinicId, 'clm');
    claimNumber = `CLM-${padNumber(claimSeq)}`;
    const row = await tx.one<{ id: string }>(
      `INSERT INTO claims (clinic_id, id, number, seq, patient_id, bill_id, date, amount, status)
       VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, 'Draft') RETURNING id`,
      [clinicId, claimNumber, claimSeq, p.patientId, p.id, c.date, total],
    );
    claimId = row!.id;
  }

  await publish(tx, clinicId, 'bill', p.id);
  if (claimId) await publish(tx, clinicId, 'claim', claimId);
  for (const drugId of touched) await publish(tx, clinicId, 'drug', drugId);

  return { number, total, ...(claimNumber ? { claimNumber } : {}), ...(oversold.length ? { oversold } : {}) };
}

/** A holding batch for stock sold when the drug has nothing recorded at all, so the ledger still balances. */
async function createUntrackedBatch(c: MutationCtx, drugId: string): Promise<BatchRow> {
  const existing = await c.tx.one<BatchRow>(
    `SELECT id, qty, exp FROM stock_batches WHERE clinic_id = $1 AND drug_id = $2 AND batch_no = 'UNTRACKED'`,
    [c.clinicId, drugId],
  );
  if (existing) return existing;
  const row = await c.tx.one<BatchRow>(
    `INSERT INTO stock_batches (clinic_id, id, drug_id, batch_no, exp, qty)
     VALUES ($1, gen_random_uuid(), $2, 'UNTRACKED', '9999-12-31', 0) RETURNING id, qty, exp`,
    [c.clinicId, drugId],
  );
  return row!;
}
