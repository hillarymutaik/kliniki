import type { Tx } from '../db';
import { emit } from './changes';

// The shapes devices and clients receive. They mirror the app's own types (src/domain/types.ts), with
// uuid ids, so what comes down the change feed drops straight into the local store.

export interface PatientDto {
  id: string;
  name: string;
  phone: string;
  dob: string;
  sex: 'F' | 'M';
  sha: string;
  allergies: string;
  erased: boolean;
}

export interface DrugDto {
  id: string;
  name: string;
  unit: string;
  price: number;
  reorder: number;
  batches: { id: string; no: string; qty: number; exp: string }[];
}

export interface BillDto {
  id: string;
  number: string;
  patientId: string;
  date: string;
  lines: { name: string; qty: number; price: number; drugId?: string }[];
  method: 'M-Pesa' | 'Cash' | 'SHA';
  ref: string;
  total: number;
}

export const loaders = {
  async patient(tx: Tx, clinicId: string, id: string): Promise<PatientDto | undefined> {
    const r = await tx.one(
      'SELECT id, name, phone, dob, sex, sha, allergies, erased_at FROM patients WHERE clinic_id = $1 AND id = $2',
      [clinicId, id],
    );
    return r && { id: r.id, name: r.name, phone: r.phone, dob: r.dob, sex: r.sex, sha: r.sha, allergies: r.allergies, erased: !!r.erased_at };
  },

  async service(tx: Tx, clinicId: string, id: string) {
    const r = await tx.one('SELECT id, name, price FROM services WHERE clinic_id = $1 AND id = $2', [clinicId, id]);
    return r && { id: r.id as string, name: r.name as string, price: r.price as number };
  },

  async drug(tx: Tx, clinicId: string, id: string): Promise<DrugDto | undefined> {
    const d = await tx.one('SELECT id, name, unit, price, reorder FROM drugs WHERE clinic_id = $1 AND id = $2', [clinicId, id]);
    if (!d) return undefined;
    const batches = await tx.query(
      'SELECT id, batch_no, qty, exp FROM stock_batches WHERE clinic_id = $1 AND drug_id = $2 ORDER BY exp, created_at, id',
      [clinicId, id],
    );
    return {
      id: d.id,
      name: d.name,
      unit: d.unit,
      price: d.price,
      reorder: d.reorder,
      batches: batches.map((b) => ({ id: b.id, no: b.batch_no, qty: b.qty, exp: b.exp })),
    };
  },

  async appointment(tx: Tx, clinicId: string, id: string) {
    const r = await tx.one(
      'SELECT id, patient_id, date, time, reason, status, queue_no FROM appointments WHERE clinic_id = $1 AND id = $2',
      [clinicId, id],
    );
    return (
      r && {
        id: r.id as string,
        patientId: r.patient_id as string,
        date: r.date as string,
        time: r.time as string,
        reason: r.reason as string,
        status: r.status as 'waiting' | 'consult' | 'done',
        queueNo: r.queue_no as number,
      }
    );
  },

  async bill(tx: Tx, clinicId: string, id: string): Promise<BillDto | undefined> {
    const b = await tx.one('SELECT id, number, patient_id, date, method, ref, total FROM bills WHERE clinic_id = $1 AND id = $2', [
      clinicId,
      id,
    ]);
    if (!b) return undefined;
    const lines = await tx.query('SELECT name, qty, price, drug_id FROM bill_lines WHERE clinic_id = $1 AND bill_id = $2 ORDER BY line_no', [
      clinicId,
      id,
    ]);
    return {
      id: b.id,
      number: b.number,
      patientId: b.patient_id,
      date: b.date,
      method: b.method,
      ref: b.ref,
      total: b.total,
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, ...(l.drug_id ? { drugId: l.drug_id } : {}) })),
    };
  },

  async claim(tx: Tx, clinicId: string, id: string) {
    const r = await tx.one('SELECT id, number, patient_id, bill_id, date, amount, status FROM claims WHERE clinic_id = $1 AND id = $2', [
      clinicId,
      id,
    ]);
    return (
      r && {
        id: r.id as string,
        number: r.number as string,
        patientId: r.patient_id as string,
        billId: (r.bill_id as string | null) ?? null,
        date: r.date as string,
        amount: r.amount as number,
        status: r.status as 'Draft' | 'Submitted' | 'Approved' | 'Rejected',
      }
    );
  },

  async clinic(tx: Tx, clinicId: string) {
    const r = await tx.one('SELECT id, name FROM clinics WHERE id = $1', [clinicId]);
    return r && { id: r.id as string, name: r.name as string };
  },
};

export type EntityName = keyof typeof loaders;

/** Reads an entity's current state and publishes it to the change feed. */
export async function publish(tx: Tx, clinicId: string, entity: EntityName, id: string): Promise<void> {
  const data = entity === 'clinic' ? await loaders.clinic(tx, clinicId) : await (loaders[entity] as any)(tx, clinicId, id);
  if (!data) return;
  await emit(tx, clinicId, entity, id, 'upsert', data);
}
