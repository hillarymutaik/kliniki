import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Connection for the API. Must be the unprivileged kliniki_app role; never a superuser or the table owner. */
  DATABASE_URL: z.string().min(1),
  /** Connection for migrations only (the schema owner). Not needed to run the API. */
  DATABASE_OWNER_URL: z.string().optional(),
  /** Password given to the kliniki_app role when migrations create it. Leave unset if a DBA creates the role. */
  APP_DB_PASSWORD: z.string().optional(),
  /** How long a write waits for a clinic's lock before the device is told to retry (HTTP 503). */
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  /** How long a request waits for a free database connection before it is turned away (HTTP 503). */
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(50).default(5000),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(15 * 60),
  /** Long on purpose: a device that was offline all day must still be able to refresh and push. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** If set, creating a clinic requires this code, so signups are by invitation. */
  REGISTRATION_CODE: z.string().optional(),
  /** Clinics one address may create per hour. Keep this low in production; signups are rare. */
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().min(1).default(5),
  /** Sign-in attempts per account and address per minute. */
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  /** Comma-separated browser origins allowed to call the API. */
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Behind a reverse proxy, trust X-Forwarded-For so rate limits see real client addresses. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

/** Reads and checks the environment. Throws with a readable list of everything that is wrong. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(env)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid server configuration:\n${problems}`);
  }
  return parsed.data;
}
