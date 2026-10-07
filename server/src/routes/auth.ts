import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { normalizeLogin } from '../auth/login-name';
import { login, logout, refresh, registerClinic } from '../auth/sessions';
import type { Config } from '../config';
import type { Pool } from '../db';
import { badRequest, forbidden } from '../errors';
import type { TokenSigner } from '../auth/tokens';
import { parse } from './context';

const device = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) });
const loginName = z.string().min(3).max(120);
const password = z.string().min(10, 'Use at least 10 characters.').max(200);

const sameSecret = (given: string | undefined, expected: string) => {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function authRoutes(app: FastifyInstance, deps: { pool: Pool; config: Config; signer: TokenSigner; now: () => Date }) {
  const { config } = deps;

  app.post(
    '/v1/auth/register',
    { config: { rateLimit: { max: config.RATE_LIMIT_REGISTER_PER_HOUR, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = parse(
        z.object({
          clinicName: z.string().trim().min(1).max(80),
          adminName: z.string().trim().min(1).max(60),
          login: loginName,
          password,
          device,
          registrationCode: z.string().optional(),
        }),
        req.body,
      );
      if (config.REGISTRATION_CODE && !sameSecret(body.registrationCode, config.REGISTRATION_CODE)) {
        throw forbidden('A valid registration code is needed to create a clinic.');
      }
      const loginId = normalizeLogin(body.login);
      if (!loginId) throw badRequest('invalid_login', 'Use a Kenyan mobile number (07…) or an email address.');
      const session = await registerClinic(deps, { ...body, login: loginId });
      return reply.code(201).send(session);
    },
  );

  app.post(
    '/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: config.RATE_LIMIT_LOGIN_PER_MINUTE,
          timeWindow: '1 minute',
          // The default hook runs before the body is parsed, which would leave the account name out of
          // the key below and put every sign-in from one address in a single shared bucket.
          hook: 'preHandler',
          // Per account and address, so guessing one account's password from many places, or many accounts
          // from one place, both hit a limit.
          keyGenerator: (req: { ip: string; body?: unknown }) =>
            `${req.ip}:${String((req.body as { login?: unknown } | undefined)?.login ?? '').toLowerCase().slice(0, 120)}`,
        },
      },
    },
    async (req) => {
      const body = parse(z.object({ login: loginName, password: z.string().min(1).max(200), clinicId: z.uuid().optional(), device }), req.body);
      // A name that is not a valid login cannot belong to anyone; answer like any other wrong password.
      const loginId = normalizeLogin(body.login) ?? '';
      return login(deps, { ...body, login: loginId });
    },
  );

  app.post('/v1/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    return refresh(deps, body.refreshToken);
  });

  app.post('/v1/auth/logout', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
    await logout(deps, body.refreshToken);
    return reply.code(204).send();
  });
}
