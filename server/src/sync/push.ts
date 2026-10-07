import { z } from 'zod';

import { addDays, isValidDate, today } from '@domain/dates';

import type { Tx } from '../db';
import { can, type Role } from '../permissions';
import { headSeq } from './changes';
import { isMutationType, MUTATIONS, Reject, type MutationCtx } from './mutations';

export const MAX_BATCH = 200;

/** What a device sends: an id it made up (the idempotency key), what it wants done, and when. */
export const envelope = z.object({
  id: z.uuid(),
  type: z.string().min(1).max(64),
  payload: z.unknown(),
  /** When the device made the change. Used for the date only; the server never trusts device clocks for ordering. */
  createdAt: z.iso.datetime({ offset: true }).optional(),
  /** True if the device was offline when it made the change. */
  offline: z.boolean().default(false),
});
export type Envelope = z.infer<typeof envelope>;

export const pushBody = z.object({ mutations: z.array(envelope).min(1).max(MAX_BATCH) });

export type MutationResult =
  | { id: string; status: 'applied'; data: unknown; duplicate?: true }
  | { id: string; status: 'rejected'; code: string; message: string; details?: unknown; duplicate?: true }
  /** A bug or an outage on our side. Nothing was saved or recorded: send it again later. */
  | { id: string; status: 'error'; code: 'internal'; message: string }
  /** Not attempted, because an earlier mutation hit an error and order matters. Send it again later. */
  | { id: string; status: 'skipped' };

/**
 * The calendar day a change belongs to: the day the device made it, as long as that is plausible
 * (not in the future, not more than two weeks old). Otherwise the day the server received it.
 */
export function effectiveDate(createdAt: string | undefined, receivedAt: Date): string {
  const received = today(receivedAt.getTime());
  if (!createdAt) return received;
  const made = new Date(createdAt);
  if (Number.isNaN(made.getTime())) return received;
  if (made.getTime() > receivedAt.getTime() + 10 * 60_000) return received; // from the future
  const date = today(made.getTime());
  return isValidDate(date) && date >= addDays(received, -14) ? date : received;
}

export interface PushContext {
  tx: Tx;
  clinicId: string;
  userId: string;
  deviceId: string;
  role: Role;
  now: Date;
  log: (message: string, error?: unknown) => void;
}

/**
 * Applies a batch of mutations in order inside the caller's transaction (which holds the clinic lock).
 *
 * Each mutation runs in its own savepoint, and its record in applied_mutations is written inside that same
 * savepoint, so "did it happen" and "is it recorded" can never disagree. A rejected mutation is rolled back
 * and recorded as rejected; a replayed id returns what it returned the first time.
 */
export async function applyBatch(ctx: PushContext, batch: Envelope[]): Promise<{ results: MutationResult[]; cursor: number }> {
  const results: MutationResult[] = [];
  let halted = false;

  for (const m of batch) {
    if (halted) {
      results.push({ id: m.id, status: 'skipped' });
      continue;
    }
    const result = await applyOne(ctx, m);
    results.push(result);
    if (result.status === 'error') halted = true;
  }

  await ctx.tx.query('UPDATE devices SET last_seen_at = now() WHERE clinic_id = $1 AND id = $2', [ctx.clinicId, ctx.deviceId]);
  return { results, cursor: await headSeq(ctx.tx, ctx.clinicId) };
}

async function applyOne(ctx: PushContext, m: Envelope): Promise<MutationResult> {
  const { tx, clinicId } = ctx;

  const seen = await tx.one<{ status: 'applied' | 'rejected'; result: MutationResult }>(
    'SELECT status, result FROM applied_mutations WHERE clinic_id = $1 AND id = $2',
    [clinicId, m.id],
  );
  if (seen) return { ...seen.result, duplicate: true } as MutationResult;

  try {
    return await tx.savepoint(async () => {
      if (!isMutationType(m.type)) throw new Reject('unknown_type', `Unknown mutation type "${m.type}".`);
      const def = MUTATIONS[m.type];
      if (!can(ctx.role, def.permission)) throw new Reject('forbidden', 'Your role cannot do that.');

      const parsed = def.schema.safeParse(m.payload);
      if (!parsed.success) {
        throw new Reject('invalid_payload', parsed.error.issues[0]?.message ?? 'Invalid payload.', parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })));
      }

      const mctx: MutationCtx = {
        tx,
        clinicId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        role: ctx.role,
        date: effectiveDate(m.createdAt, ctx.now),
        offline: m.offline,
      };
      const data = await def.handler(mctx, parsed.data);

      const result: MutationResult = { id: m.id, status: 'applied', data };
      await tx.query(
        `INSERT INTO applied_mutations (clinic_id, id, type, status, result, device_id) VALUES ($1, $2, $3, 'applied', $4::jsonb, $5)`,
        [clinicId, m.id, m.type, JSON.stringify(result), ctx.deviceId],
      );
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, meta) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [clinicId, ctx.userId, ctx.deviceId, `mutation.${m.type}`, JSON.stringify({ mutationId: m.id })],
      );
      return result;
    });
  } catch (error) {
    if (error instanceof Reject) {
      // The savepoint has rolled the mutation's effects back; remember the verdict so a replay gets it too.
      const result: MutationResult = {
        id: m.id,
        status: 'rejected',
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      };
      await tx.query(
        `INSERT INTO applied_mutations (clinic_id, id, type, status, result, device_id) VALUES ($1, $2, $3, 'rejected', $4::jsonb, $5)`,
        [clinicId, m.id, m.type, JSON.stringify(result), ctx.deviceId],
      );
      return result;
    }
    ctx.log(`mutation ${m.id} (${m.type}) failed`, error);
    return { id: m.id, status: 'error', code: 'internal', message: 'The server could not apply this change. Try again shortly.' };
  }
}
