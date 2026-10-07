import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { normalizeLogin } from '../auth/login-name';
import { hashPassword } from '../auth/password';
import { isPgError, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound } from '../errors';
import { ROLES } from '../permissions';
import { parse, type Runner } from './context';

export function adminRoutes(app: FastifyInstance, deps: { run: Runner }) {
  const { run } = deps;

  app.get('/v1/staff', async (req) =>
    run(req, { permission: 'staff.manage' }, async ({ tx, clinicId }) => ({
      staff: await tx.query(
        `SELECT u.id, u.name, u.login, m.role, m.active, u.disabled_at IS NOT NULL AS disabled
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.clinic_id = $1 ORDER BY lower(u.name), u.id`,
        [clinicId],
      ),
    })),
  );

  // The administrator sets a first password and tells the person; they can change it themselves later.
  app.post('/v1/staff', async (req, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(60),
        login: z.string().min(3).max(120),
        password: z.string().min(10, 'Use at least 10 characters.').max(200),
        role: z.enum(ROLES),
      }),
      req.body,
    );
    const login = normalizeLogin(body.login);
    if (!login) throw badRequest('invalid_login', 'Use a Kenyan mobile number (07…) or an email address.');
    const passwordHash = await hashPassword(body.password); // slow, so before the transaction and its lock
    const created = await run(req, { write: true, permission: 'staff.manage' }, async ({ tx, clinicId, userId, deviceId }) => {
      const id = randomUUID();
      try {
        await tx.query('INSERT INTO users (id, login, name, password_hash) VALUES ($1, $2, $3, $4)', [id, login, body.name, passwordHash]);
      } catch (error) {
        if (isPgError(error, UNIQUE_VIOLATION)) throw conflict('login_taken', 'That phone number or email is already registered.');
        throw error;
      }
      await tx.query('INSERT INTO memberships (clinic_id, user_id, role) VALUES ($1, $2, $3)', [clinicId, id, body.role]);
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, entity, entity_id, meta) VALUES ($1, $2, $3, 'staff.add', 'user', $4, $5::jsonb)`,
        [clinicId, userId, deviceId, id, JSON.stringify({ role: body.role })],
      );
      return { id, name: body.name, login, role: body.role, active: true };
    });
    return reply.code(201).send(created);
  });

  app.patch('/v1/staff/:userId', async (req) => {
    const { userId: target } = parse(z.object({ userId: z.uuid() }), req.params);
    const body = parse(
      z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() }).refine((b) => b.role !== undefined || b.active !== undefined, 'Change the role or the active flag.'),
      req.body,
    );
    return run(req, { write: true, permission: 'staff.manage' }, async ({ tx, clinicId, userId, deviceId }) => {
      const current = await tx.one<{ role: string; active: boolean }>(
        'SELECT role, active FROM memberships WHERE clinic_id = $1 AND user_id = $2 FOR UPDATE',
        [clinicId, target],
      );
      if (!current) throw notFound('That person is not on your staff.');
      const role = body.role ?? current.role;
      const active = body.active ?? current.active;

      // A clinic must always keep someone who can manage it.
      const losesAdmin = current.role === 'admin' && current.active && (role !== 'admin' || !active);
      if (losesAdmin) {
        const others = await tx.one<{ n: number }>(
          `SELECT count(*)::int AS n FROM memberships WHERE clinic_id = $1 AND role = 'admin' AND active AND user_id <> $2`,
          [clinicId, target],
        );
        if (!others || others.n === 0) throw conflict('last_admin', 'The clinic needs at least one active administrator.');
      }

      await tx.query('UPDATE memberships SET role = $3, active = $4 WHERE clinic_id = $1 AND user_id = $2', [clinicId, target, role, active]);
      if (!active) {
        // Their sessions end with their access: refresh tokens for this clinic are revoked at once.
        await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE clinic_id = $1 AND user_id = $2 AND revoked_at IS NULL', [clinicId, target]);
      }
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, entity, entity_id, meta) VALUES ($1, $2, $3, 'staff.update', 'user', $4, $5::jsonb)`,
        [clinicId, userId, deviceId, target, JSON.stringify({ role, active })],
      );
      return { id: target, role, active };
    });
  });

  app.get('/v1/devices', async (req) =>
    run(req, { permission: 'staff.manage' }, async ({ tx, clinicId }) => ({
      devices: await tx.query(
        `SELECT d.id, d.name, d.created_at AS "createdAt", d.last_seen_at AS "lastSeenAt", d.revoked_at AS "revokedAt", u.name AS "userName"
         FROM devices d JOIN users u ON u.id = d.user_id WHERE d.clinic_id = $1 ORDER BY d.created_at DESC`,
        [clinicId],
      ),
    })),
  );

  /** Locks a lost or stolen device out: its tokens stop working immediately and it cannot sign in again. */
  app.post('/v1/devices/:id/revoke', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return run(req, { write: true, permission: 'staff.manage' }, async ({ tx, clinicId, userId, deviceId }) => {
      const done = await tx.one('UPDATE devices SET revoked_at = COALESCE(revoked_at, now()) WHERE clinic_id = $1 AND id = $2 RETURNING id', [clinicId, id]);
      if (!done) throw notFound('That device is not registered.');
      await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE clinic_id = $1 AND device_id = $2 AND revoked_at IS NULL', [clinicId, id]);
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, entity, entity_id) VALUES ($1, $2, $3, 'device.revoke', 'device', $4)`,
        [clinicId, userId, deviceId, id],
      );
      return { id, revoked: true };
    });
  });
}
