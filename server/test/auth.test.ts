import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/auth/password';
import { normalizeLogin } from '../src/auth/login-name';
import { loadConfig } from '../src/config';
import { addStaff, apply, call, createEnv, mut, newPatient, PASSWORD, phone, pushOne, registerClinic, rows, type Env, type Session } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(() => env.close());

const device = () => ({ id: randomUUID(), name: 'Test phone' });
const login = (login: string, password = PASSWORD, extra: object = {}) => call(env, 'POST', '/v1/auth/login', undefined, { login, password, device: device(), ...extra });

describe('registering a clinic', () => {
  it('creates the clinic and its administrator and signs them in', async () => {
    const s = await registerClinic(env, { clinicName: 'Tumaini Clinic', adminName: 'Otieno Ochieng' });
    expect(s).toMatchObject({ clinic: { name: 'Tumaini Clinic' }, user: { name: 'Otieno Ochieng', role: 'admin' } });
    expect((await call(env, 'GET', '/v1/me', s.accessToken)).body).toMatchObject({ user: { role: 'admin' }, clinic: { name: 'Tumaini Clinic' } });
    expect(await rows(env, 'SELECT name, value FROM counters WHERE clinic_id = $1 ORDER BY name', [s.clinic.id])).toEqual([
      { name: 'clm', value: 0 },
      { name: 'inv', value: 0 },
      { name: 'seq', value: 0 },
    ]);
  });

  it('refuses a second account on the same phone or email, however it is written', async () => {
    const number = phone();
    await registerClinic(env, { login: number });
    const again = await call(env, 'POST', '/v1/auth/register', undefined, {
      clinicName: 'Other', adminName: 'Other', login: `+254${number.slice(1)}`, password: PASSWORD, device: device(),
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('login_taken');
  });

  it('rejects weak passwords and logins that are neither a Kenyan number nor an email', async () => {
    const base = { clinicName: 'C', adminName: 'A', device: device() };
    expect((await call(env, 'POST', '/v1/auth/register', undefined, { ...base, login: phone(), password: 'short' })).status).toBe(400);
    const bad = await call(env, 'POST', '/v1/auth/register', undefined, { ...base, login: 'not-a-login', password: PASSWORD });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_login');
  });

  it('limits how many clinics one address can create in an hour', async () => {
    const strict = await createEnv({ RATE_LIMIT_REGISTER_PER_HOUR: '3' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const body = { clinicName: 'C', adminName: 'A', login: phone(), password: PASSWORD, device: device() };
        statuses.push((await call(strict, 'POST', '/v1/auth/register', undefined, body)).status);
      }
      expect(statuses).toEqual([201, 201, 201, 429, 429]);
    } finally {
      await strict.close();
    }
  });

  it('can be limited to people holding a registration code', async () => {
    const gated = await createEnv({ REGISTRATION_CODE: 'let-me-in-please' });
    try {
      const body = { clinicName: 'C', adminName: 'A', login: phone(), password: PASSWORD, device: device() };
      expect((await call(gated, 'POST', '/v1/auth/register', undefined, body)).status).toBe(403);
      expect((await call(gated, 'POST', '/v1/auth/register', undefined, { ...body, registrationCode: 'wrong' })).status).toBe(403);
      expect((await call(gated, 'POST', '/v1/auth/register', undefined, { ...body, registrationCode: 'let-me-in-please' })).status).toBe(201);
    } finally {
      await gated.close();
    }
  });
});

describe('signing in', () => {
  it('accepts a phone number in any common form, and an email in any case', async () => {
    const number = phone();
    await registerClinic(env, { login: number });
    for (const form of [number, `+254${number.slice(1)}`, `254${number.slice(1)}`, `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}`]) {
      expect((await login(form)).status, form).toBe(200);
    }
    await registerClinic(env, { login: 'Clinic.Admin@Example.COM' });
    expect((await login('clinic.admin@example.com')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const number = phone();
    await registerClinic(env, { login: number });
    const wrong = await login(number, 'definitely wrong password');
    const unknown = await login(phone());
    const garbage = await login('???');
    for (const r of [wrong, unknown, garbage]) {
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('Wrong phone number, email or password.');
    }
  });

  it('keeps a device registered per clinic and re-uses it on the next sign-in', async () => {
    const number = phone();
    const s = await registerClinic(env, { login: number });
    await login(number, PASSWORD, { device: { id: s.deviceId, name: 'Renamed tablet' } });
    const list = await call(env, 'GET', '/v1/devices', s.accessToken);
    expect(list.body.devices.filter((d: { id: string }) => d.id === s.deviceId)).toEqual([expect.objectContaining({ name: 'Renamed tablet' })]);
  });

  it('is rate limited per account', async () => {
    const number = phone();
    await registerClinic(env, { login: number });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await login(number, `wrong password ${i}`)).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect((await login(phone())).status).toBe(401); // a different account is not affected
  });
});

describe('access tokens', () => {
  it('rejects missing, malformed, expired and wrongly-signed tokens', async () => {
    const s = await registerClinic(env);
    expect((await call(env, 'GET', '/v1/me')).status).toBe(401);
    expect((await call(env, 'GET', '/v1/me', 'not.a.token')).status).toBe(401);

    const forge = (secret: string, expires: string) =>
      new SignJWT({ cid: s.clinic.id, did: s.deviceId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(s.user.id)
        .setIssuer('kliniki')
        .setAudience('kliniki-api')
        .setExpirationTime(expires)
        .sign(new TextEncoder().encode(secret));
    expect((await call(env, 'GET', '/v1/me', await forge(env.config.JWT_SECRET, '1h'))).status).toBe(200); // control: the forge is accurate
    expect((await call(env, 'GET', '/v1/me', await forge(env.config.JWT_SECRET, '-1m'))).status).toBe(401);
    expect((await call(env, 'GET', '/v1/me', await forge('some-other-secret-some-other-secret!!', '1h'))).status).toBe(401);
  });

  it("reads the role from the database, so a demotion bites on the very next request", async () => {
    const admin = await registerClinic(env);
    const staff = await addStaff(env, admin, 'receptionist');
    const patient = await newPatient(env, staff);
    expect((await pushOne(env, staff, mut('patient.update', { id: patient.id, changes: { allergies: 'Sulfa' } }))).status).toBe('applied');

    const demote = await call(env, 'PATCH', `/v1/staff/${staff.user.id}`, admin.accessToken, { role: 'pharmacist' });
    expect(demote.status).toBe(200);
    expect(await pushOne(env, staff, mut('patient.update', { id: patient.id, changes: { allergies: 'None' } }))).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });
});

describe('refresh tokens', () => {
  it('rotates: each token works once and yields a new pair', async () => {
    const s = await registerClinic(env);
    const next = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
    expect(next.status).toBe(200);
    expect(next.body.refreshToken).not.toBe(s.refreshToken);
    expect((await call(env, 'GET', '/v1/me', next.body.accessToken)).status).toBe(200);
  });

  it('treats a stale token being replayed as theft and ends the whole session', async () => {
    const s = await registerClinic(env);
    const second = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
    env.clock.now = new Date(env.clock.now.getTime() + 60_000); // well past the retry grace window
    try {
      const replay = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
      expect(replay.status).toBe(401);
      // The legitimate holder's newer token was revoked with it: they must sign in again.
      expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: second.body.refreshToken })).status).toBe(401);
      expect(await rows(env, `SELECT 1 FROM audit_log WHERE clinic_id = $1 AND action = 'auth.refresh_reuse_detected'`, [s.clinic.id])).toHaveLength(1);
    } finally {
      env.clock.now = new Date('2026-10-07T07:00:00Z');
    }
  });

  it("forgives a retried refresh (a dropped connection) inside the grace window, without revoking anything", async () => {
    const s = await registerClinic(env);
    const first = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
    const retry = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
    expect(retry.status).toBe(401); // this attempt fails…
    expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: first.body.refreshToken })).status).toBe(200); // …but the chain survives
  });

  it('expires after the configured lifetime', async () => {
    const s = await registerClinic(env);
    env.clock.now = new Date(env.clock.now.getTime() + 31 * 86_400_000);
    try {
      expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken })).status).toBe(401);
    } finally {
      env.clock.now = new Date('2026-10-07T07:00:00Z');
    }
  });

  it('works for a device that was offline for hours: its old access token is dead, refresh brings it back', async () => {
    const s = await registerClinic(env);
    const expired = await new SignJWT({ cid: s.clinic.id, did: s.deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(s.user.id).setIssuer('kliniki').setAudience('kliniki-api')
      .setExpirationTime('-8h')
      .sign(new TextEncoder().encode(env.config.JWT_SECRET));
    const batch = [mut('service.upsert', { id: randomUUID(), name: 'Queued offline', price: 100 }, { offline: true })];
    expect((await call(env, 'POST', '/v1/sync/push', expired, { mutations: batch })).status).toBe(401);

    const fresh = await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken });
    const pushed = await call(env, 'POST', '/v1/sync/push', fresh.body.accessToken, { mutations: batch });
    expect(pushed.body.results[0].status).toBe('applied');
  });

  it('is ended by logout', async () => {
    const s = await registerClinic(env);
    expect((await call(env, 'POST', '/v1/auth/logout', undefined, { refreshToken: s.refreshToken })).status).toBe(204);
    expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: s.refreshToken })).status).toBe(401);
  });
});

describe('removing access', () => {
  it('locks out a revoked device at once: its token, its refresh token and any new sign-in', async () => {
    const number = phone();
    const admin = await registerClinic(env, { login: number });
    const phoneSession = await addStaff(env, admin, 'clinician');
    expect((await call(env, 'GET', '/v1/me', phoneSession.accessToken)).status).toBe(200);

    expect((await call(env, 'POST', `/v1/devices/${phoneSession.deviceId}/revoke`, admin.accessToken)).status).toBe(200);

    expect((await call(env, 'GET', '/v1/me', phoneSession.accessToken)).status).toBe(401);
    expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: phoneSession.refreshToken })).status).toBe(401);
    const staffLogin = (await call(env, 'GET', '/v1/staff', admin.accessToken)).body.staff.find((s: { id: string }) => s.id === phoneSession.user.id).login;
    const again = await call(env, 'POST', '/v1/auth/login', undefined, { login: staffLogin, password: PASSWORD, device: { id: phoneSession.deviceId, name: 'Same phone' } });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('device_revoked');
    expect((await call(env, 'GET', '/v1/me', admin.accessToken)).status).toBe(200); // other devices unaffected
  });

  it('ends a deactivated person\'s sessions at once, and will not deactivate the last administrator', async () => {
    const admin = await registerClinic(env);
    const staff = await addStaff(env, admin, 'pharmacist');
    expect((await call(env, 'PATCH', `/v1/staff/${staff.user.id}`, admin.accessToken, { active: false })).status).toBe(200);
    expect((await call(env, 'GET', '/v1/me', staff.accessToken)).status).toBe(401);
    expect((await call(env, 'POST', '/v1/auth/refresh', undefined, { refreshToken: staff.refreshToken })).status).toBe(401);

    const lastAdmin = await call(env, 'PATCH', `/v1/staff/${admin.user.id}`, admin.accessToken, { active: false });
    expect(lastAdmin.status).toBe(409);
    expect(lastAdmin.body.error.code).toBe('last_admin');
    expect((await call(env, 'PATCH', `/v1/staff/${admin.user.id}`, admin.accessToken, { role: 'clinician' })).status).toBe(409);
  });

  it('keeps staff and device management to administrators', async () => {
    const admin = await registerClinic(env);
    const clinician = await addStaff(env, admin, 'clinician');
    for (const [method, url] of [['GET', '/v1/staff'], ['GET', '/v1/devices'], ['GET', '/v1/audit']] as const) {
      expect((await call(env, method, url, clinician.accessToken)).status, url).toBe(403);
    }
    expect((await call(env, 'POST', '/v1/staff', clinician.accessToken, { name: 'X', login: phone(), password: PASSWORD, role: 'admin' })).status).toBe(403);
  });
});

describe('passwords', () => {
  it('are hashed with a salt, verify, and never match a different password', async () => {
    const one = await hashPassword('correct horse battery');
    const two = await hashPassword('correct horse battery');
    expect(one).not.toBe(two); // salted
    expect(one.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', one)).toBe(true);
    expect(await verifyPassword('correct horse batterz', one)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });

  it('are never stored or logged in the clear', async () => {
    const s = await registerClinic(env);
    const [user] = await rows(env, 'SELECT password_hash FROM users WHERE id = $1', [s.user.id]);
    expect(user.password_hash).not.toContain(PASSWORD);
    const tokens = await rows(env, 'SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [s.user.id]);
    expect(tokens.map((t) => t.token_hash)).not.toContain(s.refreshToken); // only a hash is kept
  });
});

describe('sign-in names', () => {
  it('normalises Kenyan numbers and emails, and rejects everything else', () => {
    expect(normalizeLogin('+254 712 345 678')).toBe('0712345678');
    expect(normalizeLogin('254712345678')).toBe('0712345678');
    expect(normalizeLogin('0712-345-678')).toBe('0712345678');
    expect(normalizeLogin('0112345678')).toBe('0112345678');
    expect(normalizeLogin('  Me@Example.com ')).toBe('me@example.com');
    for (const bad of ['', '12345', '0212345678', '+1 555 123 4567', 'no-at-sign', 'a@b']) expect(normalizeLogin(bad), bad).toBeNull();
  });
});

describe('configuration', () => {
  const ok = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32) };

  it('refuses to start without a strong signing secret or a database', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...ok, JWT_SECRET: 'too-short' })).toThrow(/at least 32/);
    expect(() => loadConfig({ JWT_SECRET: ok.JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('applies safe defaults', () => {
    const c = loadConfig(ok);
    expect(c).toMatchObject({ PORT: 3000, ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30, TRUST_PROXY: false });
    expect(c.CORS_ORIGINS).toBe(''); // no browser origin is allowed unless listed
  });
});
