import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { isValidDate, today } from '@domain/dates';

import { badRequest, notFound } from '../errors';
import { loaders } from '../sync/entities';
import { parse, type Runner } from './context';

const limit = z.coerce.number().int().min(1).max(200).default(50);

const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function decodeCursor<T>(raw: string | undefined, shape: z.ZodType<T>): T | undefined {
  if (!raw) return undefined;
  try {
    return shape.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
  } catch {
    throw badRequest('invalid_cursor', 'That page marker is not valid. Start again from the first page.');
  }
}

/** Escapes LIKE wildcards so a search for "50%" finds "50%" and not everything. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function readRoutes(app: FastifyInstance, deps: { run: Runner; now: () => Date }) {
  const { run } = deps;

  app.get('/v1/me', async (req) =>
    run(req, {}, async ({ tx, clinicId, userId, deviceId, role }) => {
      const me = await tx.one('SELECT id, name, login FROM users WHERE id = $1', [userId]);
      return { user: { ...me, role }, clinic: await loaders.clinic(tx, clinicId), deviceId };
    }),
  );

  app.get('/v1/patients', async (req) => {
    const q = parse(z.object({ q: z.string().trim().max(80).optional(), limit, after: z.string().max(400).optional() }), req.query);
    const after = decodeCursor(q.after, z.object({ n: z.string(), i: z.string() }));
    return run(req, {}, async ({ tx, clinicId, userId, deviceId }) => {
      const params: unknown[] = [clinicId];
      const where: string[] = ['clinic_id = $1', 'erased_at IS NULL'];
      if (q.q) {
        params.push(`%${likeEscape(q.q.toLowerCase())}%`);
        where.push(`(lower(name) LIKE $${params.length} OR phone LIKE $${params.length} OR lower(sha) LIKE $${params.length})`);
      }
      if (after) {
        params.push(after.n, after.i);
        where.push(`(lower(name), id::text) > ($${params.length - 1}, $${params.length})`);
      }
      params.push(q.limit + 1);
      const rows = await tx.query(
        `SELECT id, name, phone, dob, sex, sha, allergies, lower(name) AS sort_name FROM patients
         WHERE ${where.join(' AND ')} ORDER BY lower(name), id::text LIMIT $${params.length}`,
        params,
      );
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      await tx.query(`INSERT INTO audit_log (clinic_id, user_id, device_id, action, meta) VALUES ($1, $2, $3, 'patient.list', $4::jsonb)`, [
        clinicId,
        userId,
        deviceId,
        JSON.stringify({ search: q.q ?? null, count: page.length }),
      ]);
      return {
        patients: page.map(({ sort_name: _sort, ...p }) => ({ ...p, erased: false })),
        next: rows.length > q.limit && last ? encodeCursor({ n: last.sort_name, i: last.id }) : null,
      };
    });
  });

  // Opening one patient's record is a read of health data, so it is logged against who opened it.
  app.get('/v1/patients/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return run(req, {}, async ({ tx, clinicId, userId, deviceId }) => {
      const patient = await loaders.patient(tx, clinicId, id);
      if (!patient) throw notFound('That patient is not registered.');
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, entity, entity_id) VALUES ($1, $2, $3, 'patient.read', 'patient', $4)`,
        [clinicId, userId, deviceId, id],
      );
      const visits = await tx.query(
        `SELECT id FROM appointments WHERE clinic_id = $1 AND patient_id = $2 ORDER BY date DESC, queue_no DESC LIMIT 50`,
        [clinicId, id],
      );
      const bills = await tx.query(`SELECT id FROM bills WHERE clinic_id = $1 AND patient_id = $2 ORDER BY seq DESC LIMIT 50`, [clinicId, id]);
      return {
        patient,
        visits: await Promise.all(visits.map((v) => loaders.appointment(tx, clinicId, v.id))),
        bills: await Promise.all(bills.map((b) => loaders.bill(tx, clinicId, b.id))),
      };
    });
  });

  app.get('/v1/drugs', async (req) =>
    run(req, {}, async ({ tx, clinicId }) => {
      const drugs = await tx.query('SELECT id, name, unit, price, reorder FROM drugs WHERE clinic_id = $1 ORDER BY lower(name), id', [clinicId]);
      const batches = await tx.query('SELECT id, drug_id, batch_no, qty, exp FROM stock_batches WHERE clinic_id = $1 ORDER BY exp, created_at, id', [
        clinicId,
      ]);
      return {
        drugs: drugs.map((d) => {
          const own = batches.filter((b) => b.drug_id === d.id);
          return {
            ...d,
            onHand: own.reduce((sum, b) => sum + b.qty, 0),
            batches: own.map((b) => ({ id: b.id, no: b.batch_no, qty: b.qty, exp: b.exp })),
          };
        }),
      };
    }),
  );

  /** Sales made offline that the shelf could not cover, newest first, so staff can reconcile them. */
  app.get('/v1/stock/oversold', async (req) =>
    run(req, {}, async ({ tx, clinicId }) => ({
      movements: await tx.query(
        `SELECT m.id, m.drug_id AS "drugId", d.name AS "drugName", m.delta, m.bill_id AS "billId", m.created_at AS "at"
         FROM stock_movements m JOIN drugs d ON d.clinic_id = m.clinic_id AND d.id = m.drug_id
         WHERE m.clinic_id = $1 AND m.oversold ORDER BY m.created_at DESC LIMIT 200`,
        [clinicId],
      ),
    })),
  );

  app.get('/v1/bills', async (req) => {
    const q = parse(z.object({ limit, before: z.coerce.number().int().min(1).optional() }), req.query);
    return run(req, {}, async ({ tx, clinicId }) => {
      const rows = await tx.query<{ id: string; seq: number }>(
        `SELECT id, seq FROM bills WHERE clinic_id = $1 AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT $3`,
        [clinicId, q.before ?? null, q.limit + 1],
      );
      const page = rows.slice(0, q.limit);
      return {
        bills: await Promise.all(page.map((r) => loaders.bill(tx, clinicId, r.id))),
        next: rows.length > q.limit ? page[page.length - 1]!.seq : null,
      };
    });
  });

  app.get('/v1/claims', async (req) => {
    const q = parse(z.object({ limit, status: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected']).optional() }), req.query);
    return run(req, {}, async ({ tx, clinicId }) => {
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM claims WHERE clinic_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY seq DESC LIMIT $3`,
        [clinicId, q.status ?? null, q.limit],
      );
      return { claims: await Promise.all(rows.map((r) => loaders.claim(tx, clinicId, r.id))) };
    });
  });

  app.get('/v1/appointments', async (req) => {
    const q = parse(z.object({ date: z.string().refine(isValidDate, 'Use YYYY-MM-DD.').optional() }), req.query);
    return run(req, {}, async ({ tx, clinicId }) => {
      const rows = await tx.query<{ id: string }>(
        'SELECT id FROM appointments WHERE clinic_id = $1 AND date = $2 ORDER BY queue_no',
        [clinicId, q.date ?? today(deps.now().getTime())],
      );
      return { appointments: await Promise.all(rows.map((r) => loaders.appointment(tx, clinicId, r.id))) };
    });
  });

  app.get('/v1/audit', async (req) => {
    const q = parse(z.object({ limit, before: z.coerce.number().int().min(1).optional() }), req.query);
    return run(req, { permission: 'audit.read' }, async ({ tx, clinicId }) => {
      const rows = await tx.query<{ id: number }>(
        `SELECT a.id, a.action, a.entity, a.entity_id AS "entityId", a.meta, a.at, u.name AS "userName", a.device_id AS "deviceId"
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.clinic_id = $1 AND ($2::bigint IS NULL OR a.id < $2) ORDER BY a.id DESC LIMIT $3`,
        [clinicId, q.before ?? null, q.limit + 1],
      );
      const page = rows.slice(0, q.limit);
      return { entries: page, next: rows.length > q.limit ? page[page.length - 1]!.id : null };
    });
  });
}
