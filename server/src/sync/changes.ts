import type { Tx } from '../db';

/**
 * Advances a named per-clinic counter and returns the new value. The upsert makes the first use create
 * it. Only call this in a transaction that holds the clinic's write lock: that is what stops two
 * writers handing out the same number and what keeps committed values in order without gaps.
 */
export async function nextCounter(tx: Tx, clinicId: string, name: string): Promise<number> {
  const row = await tx.one<{ value: number }>(
    `INSERT INTO counters (clinic_id, name, value) VALUES ($1, $2, 1)
     ON CONFLICT (clinic_id, name) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [clinicId, name],
  );
  return row!.value;
}

/** The newest change number committed for the clinic (0 if there are none). */
export async function headSeq(tx: Tx, clinicId: string): Promise<number> {
  const row = await tx.one<{ value: number }>(`SELECT value FROM counters WHERE clinic_id = $1 AND name = 'seq'`, [clinicId]);
  return row?.value ?? 0;
}

/** Appends one entry to the change feed that devices pull from. */
export async function emit(
  tx: Tx,
  clinicId: string,
  entity: string,
  entityId: string,
  op: 'upsert' | 'delete',
  data: unknown,
): Promise<number> {
  const seq = await nextCounter(tx, clinicId, 'seq');
  await tx.query(
    'INSERT INTO changes (clinic_id, seq, entity, entity_id, op, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [clinicId, seq, entity, entityId, op, JSON.stringify(data)],
  );
  return seq;
}
