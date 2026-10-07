import { addDays } from './dates';
import type { Batch, Drug } from './types';

export const EXPIRY_WARNING_DAYS = 60;

/** A batch dated today or earlier counts as expired, the same rule applied when stock is received. */
export const isExpired = (batch: Pick<Batch, 'exp'>, today: string) => batch.exp <= today;

/** Physical count on the shelf, expired batches included. */
export const onHand = (drug: Drug) => drug.batches.reduce((sum, batch) => sum + batch.qty, 0);

/** Units that may still be dispensed. Expired batches are never sold. */
export const sellable = (drug: Drug, today: string) =>
  drug.batches.reduce((sum, batch) => (isExpired(batch, today) ? sum : sum + batch.qty), 0);

export type StockStatus = 'out' | 'reorder' | 'ok';

export function stockStatus(drug: Drug, today: string): StockStatus {
  const available = sellable(drug, today);
  if (available === 0) return 'out';
  return available <= drug.reorder ? 'reorder' : 'ok';
}

/** Stock that is already expired. */
export const hasExpiredStock = (drug: Drug, today: string) =>
  drug.batches.some((batch) => batch.qty > 0 && isExpired(batch, today));

/** Stock that is expired or will expire inside the warning window. */
export function hasExpiringStock(drug: Drug, today: string): boolean {
  const horizon = addDays(today, EXPIRY_WARNING_DAYS);
  return drug.batches.some((batch) => batch.qty > 0 && batch.exp <= horizon);
}

/** The batch that will be used next: soonest expiry among those that still hold stock. */
export function nearestBatch(drug: Drug): Batch | undefined {
  return drug.batches.filter((batch) => batch.qty > 0).sort((a, b) => a.exp.localeCompare(b.exp))[0];
}

/** Retail value of what can still be sold. */
export const stockValue = (drugs: Drug[], today: string) =>
  drugs.reduce((sum, drug) => sum + sellable(drug, today) * drug.price, 0);

/**
 * First-expiry-first-out: takes `qty` units from the batches that expire soonest and skips expired
 * ones. Callers must have checked `sellable` first; this does not report a shortfall.
 */
export function deductFefo(batches: Batch[], qty: number, today: string): Batch[] {
  let remaining = qty;
  return [...batches]
    .sort((a, b) => a.exp.localeCompare(b.exp))
    .map((batch) => {
      if (remaining <= 0 || batch.qty === 0 || isExpired(batch, today)) return batch;
      const taken = Math.min(batch.qty, remaining);
      remaining -= taken;
      return { ...batch, qty: batch.qty - taken };
    });
}

export interface FefoAllocation<T> {
  /** Units to take from each batch, soonest expiry first. Only batches that supply something appear. */
  takes: { batch: T; take: number }[];
  /** Units that could not be supplied from sellable stock. */
  shortfall: number;
}

/**
 * First-expiry-first-out planning for callers that hold their own batch records (the server's database
 * rows): says how much to take from which batch without changing anything. Expired and empty batches are
 * never used, the same rules as `deductFefo`, which this deliberately leaves alone.
 */
export function allocateFefo<T extends { qty: number; exp: string }>(
  batches: T[],
  qty: number,
  today: string,
): FefoAllocation<T> {
  let remaining = qty;
  const takes: FefoAllocation<T>['takes'] = [];
  const usable = batches
    .filter((batch) => batch.qty > 0 && !isExpired(batch, today))
    .sort((a, b) => a.exp.localeCompare(b.exp));
  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(batch.qty, remaining);
    takes.push({ batch, take });
    remaining -= take;
  }
  return { takes, shortfall: Math.max(0, remaining) };
}
