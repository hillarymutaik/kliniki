import { createHash } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { createTokenSigner } from './auth/tokens';
import type { Config } from './config';
import type { Pool } from './db';
import { ApiError } from './errors';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { createRunner } from './routes/context';
import { readRoutes } from './routes/reads';
import { syncRoutes } from './routes/sync';

/** Postgres error classes and pool messages that mean "try again", not "something is broken". */
function isTemporarilyUnavailable(e: { code?: string; message?: string }): boolean {
  if (e.code && (['53300', '57014', '57P01', '57P02', '57P03'].includes(e.code) || e.code.startsWith('08'))) return true;
  if (e.code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(e.code)) return true;
  return /timeout exceeded when trying to connect|Connection terminated|too many clients/i.test(e.message ?? '');
}

export interface AppDeps {
  config: Config;
  /** Pool connected as the unprivileged kliniki_app role. */
  pool: Pool;
  /** Injected so tests control "today". */
  now?: () => Date;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, pool } = deps;
  const now = deps.now ?? (() => new Date());
  const signer = createTokenSigner(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);

  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    // Slow or stalled uploads must not tie up connections.
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
  });

  await app.register(helmet);
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : false, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    // Signed-in devices are counted per token (many devices share one clinic address); everything else per address.
    keyGenerator: (req) =>
      req.headers.authorization ? `t:${createHash('sha1').update(req.headers.authorization).digest('hex')}` : `ip:${req.ip}`,
  });

  app.setErrorHandler((error: unknown, req, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'invalid_request', message: error.issues[0]?.message ?? 'Invalid request.' } });
    }
    const e = error as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' } });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: 'invalid_request', message: e.message ?? 'Invalid request.' } });
    }
    // A write that waited too long for the clinic lock: tell the device to retry rather than hang.
    if (e.code === '55P03') return reply.code(503).header('Retry-After', '2').send({ error: { code: 'busy', message: 'The clinic is busy. Try again in a moment.' } });
    // Overload and outages are the server's to recover from, so devices are told to retry rather than shown
    // a bug: no free connection, too many connections, a statement that ran too long, the database
    // starting up or shutting down, or the connection dropping.
    if (isTemporarilyUnavailable(e)) {
      return reply.code(503).header('Retry-After', '5').send({ error: { code: 'unavailable', message: 'The service is busy or restarting. Try again shortly.' } });
    }
    req.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'No such endpoint.' } }));

  // Liveness never touches the database; readiness proves it can be reached.
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.get('/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  const run = createRunner(pool, signer, config.DB_LOCK_TIMEOUT_MS);
  authRoutes(app, { pool, config, signer, now });
  syncRoutes(app, { run, now });
  readRoutes(app, { run, now });
  adminRoutes(app, { run });

  return app;
}
