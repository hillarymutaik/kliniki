import { seedData } from './seed';
import type { AppData, Ctx } from './types';

/** A Thursday, so weekday formatting is easy to eyeball. */
export const TODAY = '2026-10-01';

/** Deterministic context: fixed "today" and ids that count up from id-1. */
export function makeCtx(today: string = TODAY): Ctx {
  let n = 0;
  return { today, newId: () => `id-${++n}` };
}

export const freshData = (): AppData => seedData(TODAY);

/** Unwraps a successful result, failing the test loudly otherwise. */
export function expectOk<T>(result: { ok: true; value: T } | { ok: false; errors: object }): T {
  if (!result.ok) throw new Error(`Expected success but got errors: ${JSON.stringify(result.errors)}`);
  return result.value;
}
