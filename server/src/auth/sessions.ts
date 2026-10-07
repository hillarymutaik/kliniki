import { randomUUID } from 'node:crypto';

import type { Config } from '../config';
import { isPgError, UNIQUE_VIOLATION, withAccounts, withTenant, type Pool, type Tx } from '../db';
import { ApiError, conflict, unauthorized } from '../errors';
import type { Role } from '../permissions';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';
import { hashRefreshToken, newRefreshToken, type TokenSigner } from './tokens';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  clinic: { id: string; name: string };
  user: { id: string; name: string; role: Role };
  deviceId: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
}

interface Deps {
  pool: Pool;
  config: Config;
  signer: TokenSigner;
  now: () => Date;
}

/** A just-rotated refresh token may be presented again within this window (a retried request) without it counting as theft. */
const REUSE_GRACE_SECONDS = 15;

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Records a new device, or re-registers one that signed in before. A revoked device stays revoked. */
async function registerDevice(tx: Tx, clinicId: string, userId: string, device: DeviceInfo) {
  const row = await tx.one<{ revoked_at: string | null; user_id: string }>(
    `INSERT INTO devices (clinic_id, id, user_id, name, last_seen_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (clinic_id, id) DO UPDATE SET name = EXCLUDED.name, last_seen_at = now(),
       user_id = CASE WHEN devices.revoked_at IS NULL THEN EXCLUDED.user_id ELSE devices.user_id END
     RETURNING revoked_at, user_id`,
    [clinicId, device.id, userId, device.name],
  );
  if (row?.revoked_at) throw new ApiError(403, 'device_revoked', 'This device has been removed from the clinic.');
}

async function mint(
  deps: Deps,
  tx: Tx,
  args: { userId: string; clinicId: string; deviceId: string; familyId?: string },
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const refreshToken = newRefreshToken();
  await tx.query(
    `INSERT INTO refresh_tokens (id, user_id, clinic_id, device_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      args.userId,
      args.clinicId,
      args.deviceId,
      args.familyId ?? randomUUID(),
      hashRefreshToken(refreshToken),
      addDays(deps.now(), deps.config.REFRESH_TOKEN_TTL_DAYS),
    ],
  );
  const accessToken = await deps.signer.signAccess({ userId: args.userId, clinicId: args.clinicId, deviceId: args.deviceId });
  return { accessToken, refreshToken, expiresIn: deps.config.ACCESS_TOKEN_TTL_SECONDS };
}

export interface RegisterInput {
  clinicName: string;
  adminName: string;
  login: string;
  password: string;
  device: DeviceInfo;
}

/** Creates a clinic with its first administrator, signed in on the device that is registering it. */
export async function registerClinic(deps: Deps, input: RegisterInput): Promise<Session> {
  const passwordHash = await hashPassword(input.password); // slow on purpose, so before any transaction
  const clinicId = randomUUID();
  const userId = randomUUID();
  try {
    return await withTenant(deps.pool, { clinicId }, async (tx) => {
      await tx.query('INSERT INTO clinics (id, name) VALUES ($1, $2)', [clinicId, input.clinicName]);
      await tx.query(
        `INSERT INTO counters (clinic_id, name, value) VALUES ($1, 'seq', 0), ($1, 'inv', 0), ($1, 'clm', 0)`,
        [clinicId],
      );
      await tx.query('INSERT INTO users (id, login, name, password_hash) VALUES ($1, $2, $3, $4)', [
        userId,
        input.login,
        input.adminName,
        passwordHash,
      ]);
      await tx.query(`INSERT INTO memberships (clinic_id, user_id, role) VALUES ($1, $2, 'admin')`, [clinicId, userId]);
      await registerDevice(tx, clinicId, userId, input.device);
      await tx.query(
        `INSERT INTO audit_log (clinic_id, user_id, device_id, action, entity, entity_id) VALUES ($1, $2, $3, 'clinic.register', 'clinic', $4)`,
        [clinicId, userId, input.device.id, clinicId],
      );
      const tokens = await mint(deps, tx, { userId, clinicId, deviceId: input.device.id });
      return {
        ...tokens,
        clinic: { id: clinicId, name: input.clinicName },
        user: { id: userId, name: input.adminName, role: 'admin' as const },
        deviceId: input.device.id,
      };
    });
  } catch (error) {
    if (isPgError(error, UNIQUE_VIOLATION)) throw conflict('login_taken', 'That phone number or email is already registered.');
    throw error;
  }
}

export interface LoginInput {
  login: string;
  password: string;
  clinicId?: string;
  device: DeviceInfo;
}

export async function login(deps: Deps, input: LoginInput): Promise<Session> {
  const found = await withAccounts(deps.pool, async (tx) => {
    const user = await tx.one<{ id: string; name: string; password_hash: string; disabled_at: string | null }>(
      'SELECT id, name, password_hash, disabled_at FROM users WHERE login = $1',
      [input.login],
    );
    if (!user) return null;
    const memberships = await tx.query<{ clinic_id: string; role: Role }>(
      'SELECT clinic_id, role FROM memberships WHERE user_id = $1 AND active ORDER BY created_at',
      [user.id],
    );
    return { user, memberships };
  });

  // Same work and same answer whether the account is missing, disabled or the password is wrong.
  if (!found) {
    await burnPasswordCheck(input.password);
    throw unauthorized('Wrong phone number, email or password.');
  }
  const passwordOk = await verifyPassword(input.password, found.user.password_hash);
  if (!passwordOk || found.user.disabled_at) throw unauthorized('Wrong phone number, email or password.');

  const membership = input.clinicId
    ? found.memberships.find((m) => m.clinic_id === input.clinicId)
    : found.memberships.length === 1
      ? found.memberships[0]
      : undefined;
  if (!membership) {
    if (found.memberships.length > 1 && !input.clinicId) {
      throw new ApiError(409, 'clinic_required', 'This account belongs to several clinics. Say which one to sign in to.', {
        clinicIds: found.memberships.map((m) => m.clinic_id),
      });
    }
    throw unauthorized('Wrong phone number, email or password.');
  }

  return withTenant(deps.pool, { clinicId: membership.clinic_id }, async (tx) => {
    await registerDevice(tx, membership.clinic_id, found.user.id, input.device);
    const clinic = await tx.one<{ name: string }>('SELECT name FROM clinics WHERE id = $1', [membership.clinic_id]);
    await tx.query(
      `INSERT INTO audit_log (clinic_id, user_id, device_id, action) VALUES ($1, $2, $3, 'auth.login')`,
      [membership.clinic_id, found.user.id, input.device.id],
    );
    const tokens = await mint(deps, tx, { userId: found.user.id, clinicId: membership.clinic_id, deviceId: input.device.id });
    return {
      ...tokens,
      clinic: { id: membership.clinic_id, name: clinic?.name ?? '' },
      user: { id: found.user.id, name: found.user.name, role: membership.role },
      deviceId: input.device.id,
    };
  });
}

type TokenRow = {
  id: string;
  user_id: string;
  clinic_id: string;
  device_id: string;
  family_id: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
};

/**
 * Trades a refresh token for a new pair. Each refresh token works once. Presenting an old one again
 * (outside a short grace window for retried requests) means it was copied, so the whole chain is revoked.
 */
export async function refresh(deps: Deps, token: string): Promise<Session> {
  const hash = hashRefreshToken(token);
  const outcome = await withAccounts(deps.pool, async (tx) => {
    const row = await tx.one<TokenRow>(
      `SELECT id, user_id, clinic_id, device_id, family_id, expires_at, used_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    if (!row || row.revoked_at || row.expires_at < deps.now()) return { kind: 'invalid' as const };
    if (row.used_at) {
      const age = (deps.now().getTime() - new Date(row.used_at).getTime()) / 1000;
      if (age <= REUSE_GRACE_SECONDS) return { kind: 'invalid' as const };
      await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [row.family_id]);
      return { kind: 'reused' as const, row };
    }
    await tx.query('UPDATE refresh_tokens SET used_at = $2 WHERE id = $1', [row.id, deps.now()]);
    return { kind: 'ok' as const, row };
  });

  if (outcome.kind !== 'ok') {
    if (outcome.kind === 'reused') {
      await withTenant(deps.pool, { clinicId: outcome.row.clinic_id }, (tx) =>
        tx.query(
          `INSERT INTO audit_log (clinic_id, user_id, device_id, action) VALUES ($1, $2, $3, 'auth.refresh_reuse_detected')`,
          [outcome.row.clinic_id, outcome.row.user_id, outcome.row.device_id],
        ),
      );
    }
    throw unauthorized();
  }

  const { row } = outcome;
  return withTenant(deps.pool, { clinicId: row.clinic_id }, async (tx) => {
    const standing = await tx.one<{ name: string; role: Role; active: boolean; disabled_at: string | null; revoked_at: string | null; clinic_name: string }>(
      `SELECT u.name, m.role, m.active, u.disabled_at, d.revoked_at, c.name AS clinic_name
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN devices d ON d.clinic_id = m.clinic_id AND d.id = $3
       JOIN clinics c ON c.id = m.clinic_id
       WHERE m.clinic_id = $1 AND m.user_id = $2`,
      [row.clinic_id, row.user_id, row.device_id],
    );
    if (!standing || !standing.active || standing.disabled_at || standing.revoked_at) throw unauthorized();
    await tx.query('UPDATE devices SET last_seen_at = now() WHERE clinic_id = $1 AND id = $2', [row.clinic_id, row.device_id]);
    const tokens = await mint(deps, tx, {
      userId: row.user_id,
      clinicId: row.clinic_id,
      deviceId: row.device_id,
      familyId: row.family_id,
    });
    return {
      ...tokens,
      clinic: { id: row.clinic_id, name: standing.clinic_name },
      user: { id: row.user_id, name: standing.name, role: standing.role },
      deviceId: row.device_id,
    };
  });
}

/** Ends the session the refresh token belongs to. Always succeeds, so callers cannot probe for valid tokens. */
export async function logout(deps: Deps, token: string): Promise<void> {
  await withAccounts(deps.pool, (tx) =>
    tx.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL`,
      [hashRefreshToken(token)],
    ),
  );
}
