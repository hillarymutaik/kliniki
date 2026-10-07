import pg from 'pg';

// pg would turn `date` columns into JS Dates in the server's time zone, which shifts them by a day.
// Dates are EAT calendar days here, so keep them as the plain YYYY-MM-DD strings Postgres sends.
pg.types.setTypeParser(1082, (value) => value);
// bigint arrives as a string by default. Counters and change sequence numbers stay far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));

export type Pool = pg.Pool;

/** One transaction, already scoped to a clinic. */
export interface Tx {
  query<R extends pg.QueryResultRow = Record<string, any>>(sql: string, params?: unknown[]): Promise<R[]>;
  /** The single row, or undefined. */
  one<R extends pg.QueryResultRow = Record<string, any>>(sql: string, params?: unknown[]): Promise<R | undefined>;
  /** Runs `fn` in a savepoint, undoing only its own changes if it throws. */
  savepoint<T>(fn: () => Promise<T>): Promise<T>;
}

export function createPool(url: string, max: number, connectTimeoutMs = 5_000): Pool {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: connectTimeoutMs,
  });
  // An idle client dropping its connection must not crash the process.
  pool.on('error', () => {});
  return pool;
}

class PgTx implements Tx {
  private depth = 0;
  constructor(private readonly client: pg.PoolClient) {}

  async query<R extends pg.QueryResultRow = Record<string, any>>(sql: string, params: unknown[] = []) {
    return (await this.client.query<R>(sql, params as any[])).rows;
  }

  async one<R extends pg.QueryResultRow = Record<string, any>>(sql: string, params: unknown[] = []) {
    return (await this.query<R>(sql, params))[0];
  }

  async savepoint<T>(fn: () => Promise<T>): Promise<T> {
    const name = `sp_${++this.depth}`;
    await this.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn();
      await this.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await this.client.query(`RELEASE SAVEPOINT ${name}`);
      throw error;
    } finally {
      this.depth--;
    }
  }
}

export interface TenantOptions {
  clinicId: string;
  /**
   * Takes the clinic's write lock first. Every transaction that changes clinic data must set this:
   * the lock is what keeps stock, document numbers and the change feed consistent between concurrent
   * writers. Reads never need it.
   */
  write?: boolean;
  /** How long to wait for the clinic's lock (and any row lock) before giving up. Defaults to 5 seconds. */
  lockTimeoutMs?: number;
  /**
   * Checks run inside the transaction BEFORE the write lock is taken, so a caller who is not allowed
   * (revoked device, disabled account) is turned away without ever queueing for the clinic's lock.
   */
  authorize?: (tx: Tx) => Promise<void>;
}

/**
 * Runs `fn` in a transaction scoped to one clinic. The tenant id is set with a transaction-local
 * setting (`true`), so a pooled connection can never carry one request's tenant into the next.
 */
export async function withTenant<T>(pool: Pool, options: TenantOptions, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.clinic_id', $1, true),
              set_config('lock_timeout', $2, true),
              set_config('statement_timeout', '15000', true)`,
      [options.clinicId, String(options.lockTimeoutMs ?? 5000)],
    );
    const tx = new PgTx(client);
    if (options.authorize) await options.authorize(tx);
    if (options.write) {
      // NO KEY UPDATE conflicts with other writers but not with the key-share locks that foreign-key
      // checks from reads and staff changes take.
      await client.query('SELECT 1 FROM clinics WHERE id = $1 FOR NO KEY UPDATE', [options.clinicId]);
    }
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true; // the connection is unusable; do not return it to the pool
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/** A transaction with no tenant, for the account tables that login must reach before it knows the clinic. */
export async function withAccounts<T>(pool: Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('lock_timeout', '5000', true), set_config('statement_timeout', '15000', true)`);
    const result = await fn(new PgTx(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

/** Postgres error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';
export const isPgError = (error: unknown, code: string): error is pg.DatabaseError =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === code;
