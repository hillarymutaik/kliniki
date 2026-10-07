import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addStaff,
  apply,
  billPayload,
  call,
  createEnv,
  mpesaCode,
  mut,
  newDrug,
  newPatient,
  pull,
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

const dispense = (drugId: string, qty: number, name = 'Amoxicillin 500mg caps') => ({ name, qty, price: 15, drugId });

/** The ledger rule: every batch's qty equals the sum of its movements. */
async function expectLedgerBalanced() {
  const off = await rows(
    env,
    `SELECT b.id, b.qty, COALESCE(sum(m.delta), 0)::int AS ledger
     FROM stock_batches b LEFT JOIN stock_movements m ON m.clinic_id = b.clinic_id AND m.batch_id = b.id
     GROUP BY b.id, b.qty HAVING b.qty <> COALESCE(sum(m.delta), 0)`,
  );
  expect(off).toEqual([]);
}

describe('creating a bill', () => {
  it('totals the lines on the server, numbers the invoice, and returns what it did', async () => {
    const patient = await newPatient(env, admin);
    const result = await pushOne(
      env,
      admin,
      mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }, { name: 'Dressing', qty: 2, price: 500 }])),
    );
    expect(result.status).toBe('applied');
    expect(result.data).toMatchObject({ total: 2000 });
    expect(result.data.number).toMatch(/^INV-\d{4}$/);
  });

  it('draws stock first-expiry-first-out across batches and keeps the ledger balanced', async () => {
    const patient = await newPatient(env, admin);
    // 3 expiring soon, 10 expiring late; an already-expired batch of 50 must never be touched.
    const drugId = await newDrug(env, admin, [[10, 300], [3, 30]]);
    await apply(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 5)])));

    const batches = await rows(env, 'SELECT batch_no, qty FROM stock_batches WHERE drug_id = $1 ORDER BY exp', [drugId]);
    expect(batches).toEqual([
      { batch_no: 'B2', qty: 0 }, // the 30-day batch emptied first
      { batch_no: 'B1', qty: 8 },
    ]);
    await expectLedgerBalanced();
  });

  it('never dispenses an expired batch, even when it is the only stock', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[10, 365]]);
    // Age the batch past its expiry directly (the API refuses to receive an expired batch).
    await rows(env, `UPDATE stock_batches SET exp = '2026-01-01' WHERE drug_id = $1`, [drugId]);
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 1)])));
    expect(result).toMatchObject({ status: 'rejected', code: 'insufficient_stock' });
  });

  it('refuses to oversell online, naming how much is left, and changes nothing', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[4, 365]]);
    const before = await rows(env, 'SELECT count(*)::int AS n FROM bills');
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 5)])));
    expect(result).toMatchObject({ status: 'rejected', code: 'insufficient_stock', message: 'Only 4 caps of Amoxicillin 500mg caps in stock.' });
    expect(await rows(env, 'SELECT count(*)::int AS n FROM bills')).toEqual(before);
    expect(await rows(env, 'SELECT qty FROM stock_batches WHERE drug_id = $1', [drugId])).toEqual([{ qty: 4 }]);
  });

  it('adds up several lines for the same drug before checking stock', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[5, 365]]);
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 3), dispense(drugId, 3)])));
    expect(result).toMatchObject({ status: 'rejected', code: 'insufficient_stock' });
  });

  it('is all-or-nothing across drugs: a shortage on the second drug leaves the first untouched', async () => {
    const patient = await newPatient(env, admin);
    const plenty = await newDrug(env, admin, [[50, 365]]);
    const scarce = await newDrug(env, admin, [[1, 365]], { name: 'Scarce drug' });
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(plenty, 10), dispense(scarce, 2, 'Scarce drug')])));
    expect(result.status).toBe('rejected');
    expect(await rows(env, 'SELECT qty FROM stock_batches WHERE drug_id = $1', [plenty])).toEqual([{ qty: 50 }]);
    await expectLedgerBalanced();
  });
});

describe('sales made on an offline device', () => {
  it('are accepted even when the shelf could not cover them, and the shortfall is flagged', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[4, 365]]);
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 7)]), { offline: true }));
    expect(result.status).toBe('applied');
    expect(result.data.oversold).toEqual([{ drugId, name: 'Amoxicillin 500mg caps', short: 3 }]);

    // The real stock was used first; the 3 missing units drive the batch negative so the books show it.
    expect(await rows(env, 'SELECT qty FROM stock_batches WHERE drug_id = $1', [drugId])).toEqual([{ qty: -3 }]);
    await expectLedgerBalanced();

    const flagged = await call(env, 'GET', '/v1/stock/oversold', admin.accessToken);
    expect(flagged.body.movements).toEqual([expect.objectContaining({ drugId, delta: -3 })]);
  });

  it('still never touch expired stock, booking the whole sale as shortfall instead', async () => {
    const patient = await newPatient(env, admin);
    const drugId = await newDrug(env, admin, [[10, 365]]);
    await rows(env, `UPDATE stock_batches SET exp = '2026-01-01' WHERE drug_id = $1`, [drugId]);
    const result = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(drugId, 2)]), { offline: true }));
    expect(result.status).toBe('applied');
    const batches = await rows(env, 'SELECT batch_no, qty FROM stock_batches WHERE drug_id = $1 ORDER BY batch_no', [drugId]);
    expect(batches).toEqual([
      { batch_no: 'B1', qty: 10 }, // the expired batch is untouched
      { batch_no: 'UNTRACKED', qty: -2 },
    ]);
    await expectLedgerBalanced();
  });

  it('use the day the device made the sale, not the day it reached the server', async () => {
    const patient = await newPatient(env, admin);
    const made = '2026-10-05T09:00:00+03:00';
    const data = await apply(env, admin, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }]), { offline: true, createdAt: made }));
    const [bill] = await rows(env, 'SELECT date FROM bills WHERE number = $1', [data.number]);
    expect(bill.date).toBe('2026-10-05');
  });

  it('ignore a device clock that claims the future', async () => {
    const patient = await newPatient(env, admin);
    const data = await apply(env, admin, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }]), { createdAt: '2030-01-01T00:00:00Z' }));
    const [bill] = await rows(env, 'SELECT date FROM bills WHERE number = $1', [data.number]);
    expect(bill.date).toBe('2026-10-07');
  });
});

describe('payment rules', () => {
  it('requires a 10-character M-Pesa code, stores it in capitals, and refuses to reuse it', async () => {
    const patient = await newPatient(env, admin);
    const lines = [{ name: 'Consultation', qty: 1, price: 1000 }];

    const bad = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, lines, { method: 'M-Pesa', ref: 'SHORT' })));
    expect(bad).toMatchObject({ status: 'rejected', code: 'invalid_mpesa_ref' });

    const code = mpesaCode();
    const ok = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, lines, { method: 'M-Pesa', ref: code.toLowerCase() })));
    expect(ok.status).toBe('applied');
    expect(await rows(env, 'SELECT ref FROM bills WHERE number = $1', [ok.data.number])).toEqual([{ ref: code }]);

    const reuse = await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, lines, { method: 'M-Pesa', ref: code })));
    expect(reuse).toMatchObject({ status: 'rejected', code: 'duplicate_mpesa_ref' });
  });

  it('needs a SHA number for SHA bills, and drafts a claim for the full amount when there is one', async () => {
    const cash = await newPatient(env, admin);
    const insured = await newPatient(env, admin, { sha: 'SHA-4410293' });
    const lines = [{ name: 'Consultation', qty: 1, price: 1000 }, { name: 'Malaria RDT', qty: 2, price: 400 }];

    expect(await pushOne(env, admin, mut('bill.create', billPayload(cash.id as string, lines, { method: 'SHA' })))).toMatchObject({
      status: 'rejected',
      code: 'sha_number_required',
    });

    const result = await pushOne(env, admin, mut('bill.create', billPayload(insured.id as string, lines, { method: 'SHA' })));
    expect(result.status).toBe('applied');
    expect(result.data).toMatchObject({ total: 1800, claimNumber: expect.stringMatching(/^CLM-\d{4}$/) });
    const [claim] = await rows(env, 'SELECT amount, status FROM claims WHERE number = $1', [result.data.claimNumber]);
    expect(claim).toEqual({ amount: 1800, status: 'Draft' });
  });

  it('rejects a bill for a patient who does not exist, or an unknown drug', async () => {
    const patient = await newPatient(env, admin);
    expect(await pushOne(env, admin, mut('bill.create', billPayload(randomUUID(), [{ name: 'x', qty: 1, price: 1 }])))).toMatchObject({ code: 'patient_not_found' });
    expect(await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [dispense(randomUUID(), 1)])))).toMatchObject({ code: 'drug_not_found' });
  });

  it('rejects malformed lines instead of guessing', async () => {
    const patient = await newPatient(env, admin);
    for (const line of [{ name: 'x', qty: 0, price: 1 }, { name: 'x', qty: 1.5, price: 1 }, { name: 'x', qty: 1, price: -5 }, { name: '', qty: 1, price: 1 }]) {
      expect(await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [line])))).toMatchObject({ status: 'rejected', code: 'invalid_payload' });
    }
    expect(await pushOne(env, admin, mut('bill.create', billPayload(patient.id as string, [])))).toMatchObject({ code: 'invalid_payload' });
  });
});

describe('what devices see afterwards', () => {
  it('publishes the bill, the claim and the drug with its new stock to the change feed', async () => {
    const insured = await newPatient(env, admin, { sha: 'SHA-1' });
    const drugId = await newDrug(env, admin, [[10, 365]]);
    const head = (await pull(env, admin, 0, 1)).head;

    await apply(env, admin, mut('bill.create', billPayload(insured.id as string, [dispense(drugId, 4)], { method: 'SHA' })));
    const { changes } = await pull(env, admin, head);

    expect(changes.map((c) => c.entity).sort()).toEqual(['bill', 'claim', 'drug']);
    const drug = changes.find((c) => c.entity === 'drug')!.data;
    expect(drug.batches.map((b: { qty: number }) => b.qty)).toEqual([6]);
    expect(changes.find((c) => c.entity === 'bill')!.data.lines).toEqual([{ name: 'Amoxicillin 500mg caps', qty: 4, price: 15, drugId }]);
  });
});

describe('who may bill', () => {
  it('lets a pharmacist bill but not edit patients, and a receptionist not touch the formulary', async () => {
    const pharmacist = await addStaff(env, admin, 'pharmacist');
    const receptionist = await addStaff(env, admin, 'receptionist');
    const patient = await newPatient(env, admin);

    const billed = await pushOne(env, pharmacist, mut('bill.create', billPayload(patient.id as string, [{ name: 'Consultation', qty: 1, price: 1000 }])));
    expect(billed.status).toBe('applied');
    expect(await pushOne(env, pharmacist, mut('patient.update', { id: patient.id, changes: { name: 'Someone Else' } }))).toMatchObject({ status: 'rejected', code: 'forbidden' });
    expect(await pushOne(env, receptionist, mut('drug.create', { id: randomUUID(), name: 'X', unit: 'tabs', price: 1, reorder: 0 }))).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });
});
