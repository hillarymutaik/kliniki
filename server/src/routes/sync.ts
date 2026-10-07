import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { headSeq } from '../sync/changes';
import { applyBatch, pushBody } from '../sync/push';
import { parse, type Runner } from './context';

const PULL_LIMIT_MAX = 1000;

export function syncRoutes(app: FastifyInstance, deps: { run: Runner; now: () => Date }) {
  const { run } = deps;

  /**
   * Devices send what they did while offline, oldest first. Every mutation is answered individually, and
   * sending the same batch again is harmless (replays return the original answer).
   */
  app.post('/v1/sync/push', async (req) => {
    const body = parse(pushBody, req.body);
    return run(req, { write: true }, (auth) =>
      applyBatch(
        {
          tx: auth.tx,
          clinicId: auth.clinicId,
          userId: auth.userId,
          deviceId: auth.deviceId,
          role: auth.role,
          now: deps.now(),
          log: (message, error) => req.log.error({ err: error }, message),
        },
        body.mutations,
      ),
    );
  });

  /**
   * Everything that changed after `cursor`, oldest first. Keep pulling while `more` is true, then remember
   * `cursor` for next time. A new device starts from 0.
   */
  app.get('/v1/sync/pull', async (req) => {
    const query = parse(
      z.object({
        cursor: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(PULL_LIMIT_MAX).default(500),
      }),
      req.query,
    );
    return run(req, {}, async ({ tx, clinicId, userId, deviceId }) => {
      const rows = await tx.query<{ seq: number; entity: string; entity_id: string; op: 'upsert' | 'delete'; data: unknown; at: string }>(
        `SELECT seq, entity, entity_id, op, data, at FROM changes WHERE clinic_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
        [clinicId, query.cursor, query.limit + 1],
      );
      const page = rows.slice(0, query.limit);
      // A full download is worth a trail; routine incremental pulls would drown the audit log.
      if (query.cursor === 0) {
        await tx.query(`INSERT INTO audit_log (clinic_id, user_id, device_id, action, meta) VALUES ($1, $2, $3, 'sync.full_pull', $4::jsonb)`, [
          clinicId,
          userId,
          deviceId,
          JSON.stringify({ count: page.length }),
        ]);
      }
      return {
        changes: page.map((r) => ({ seq: r.seq, entity: r.entity, id: r.entity_id, op: r.op, data: r.data, at: r.at })),
        cursor: page.length ? page[page.length - 1]!.seq : query.cursor,
        more: rows.length > query.limit,
        head: await headSeq(tx, clinicId),
      };
    });
  });
}
