import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { TokenSigner } from '../auth/tokens';
import { withTenant, type Pool, type Tx } from '../db';
import { badRequest, forbidden, unauthorized } from '../errors';
import { can, type Permission, type Role } from '../permissions';

/** Who is making an authenticated request, inside a transaction already scoped to their clinic. */
export interface Authed {
  tx: Tx;
  clinicId: string;
  userId: string;
  deviceId: string;
  role: Role;
}

export interface RunOptions {
  /** The request changes clinic data, so it takes the clinic's write lock. Reads leave this off. */
  write?: boolean;
  permission?: Permission;
}

export function createRunner(pool: Pool, signer: TokenSigner, lockTimeoutMs?: number) {
  /**
   * Authenticates the request and runs `handler` in one clinic-scoped transaction.
   *
   * The token only proves identity. Whether that person is still on the clinic's staff, whether the
   * device has been removed, and what role they hold are all read from the database here, before the
   * write lock is taken, so a demotion or a revoked tablet takes effect on the very next request and a
   * locked-out caller can never queue behind a busy clinic.
   */
  return async function run<T>(req: FastifyRequest, options: RunOptions, handler: (auth: Authed) => Promise<T>): Promise<T> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? await signer.verifyAccess(token) : null;
    if (!claims) throw unauthorized();

    let role!: Role;
    return withTenant(
      pool,
      {
        clinicId: claims.clinicId,
        write: options.write,
        lockTimeoutMs,
        authorize: async (tx) => {
          const row = await tx.one<{ role: Role; active: boolean; disabled_at: string | null; revoked_at: string | null }>(
            `SELECT m.role, m.active, u.disabled_at, d.revoked_at
             FROM memberships m
             JOIN users u ON u.id = m.user_id
             JOIN devices d ON d.clinic_id = m.clinic_id AND d.id = $3
             WHERE m.clinic_id = $1 AND m.user_id = $2`,
            [claims.clinicId, claims.userId, claims.deviceId],
          );
          if (!row || !row.active || row.disabled_at || row.revoked_at) throw unauthorized();
          role = row.role;
          if (options.permission && !can(role, options.permission)) throw forbidden();
        },
      },
      (tx) => handler({ tx, clinicId: claims.clinicId, userId: claims.userId, deviceId: claims.deviceId, role }),
    );
  };
}

export type Runner = ReturnType<typeof createRunner>;

/** Parses untrusted input, turning failures into a 400 that lists what is wrong. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest(
      'invalid_request',
      result.error.issues[0]?.message ?? 'Invalid request.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
