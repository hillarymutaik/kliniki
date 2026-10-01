import { addDays } from './dates';
import { hasExpiringStock, stockStatus } from './stock';
import type { AppData, Bill, PayMethod } from './types';

export interface DashboardStats {
  /** Patients today who are waiting or in consultation. */
  inQueue: number;
  collectedToday: number;
  /** Drugs at or below their reorder level, including those with nothing left to sell. */
  lowStock: number;
  /** Drugs holding stock that is expired or expires within 60 days. */
  expiring: number;
  pendingClaims: { count: number; amount: number };
}

const sumTotals = (bills: Bill[]) => bills.reduce((sum, bill) => sum + bill.total, 0);

export function dashboardStats(data: AppData, today: string): DashboardStats {
  const pending = data.claims.filter((c) => c.status === 'Draft' || c.status === 'Submitted');
  return {
    inQueue: data.appointments.filter((a) => a.date === today && a.status !== 'done').length,
    collectedToday: sumTotals(data.bills.filter((b) => b.date === today)),
    lowStock: data.drugs.filter((d) => stockStatus(d, today) !== 'ok').length,
    expiring: data.drugs.filter((d) => hasExpiringStock(d, today)).length,
    pendingClaims: { count: pending.length, amount: pending.reduce((sum, c) => sum + c.amount, 0) },
  };
}

/** One entry per day, oldest first, ending today. Days without bills are zero. */
export function revenueByDay(bills: Bill[], today: string, days = 7): { date: string; total: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, total: sumTotals(bills.filter((b) => b.date === date)) };
  });
}

/** Biggest earner first. */
export function revenueByMethod(bills: Bill[]): { method: PayMethod; total: number }[] {
  const totals = new Map<PayMethod, number>();
  for (const bill of bills) totals.set(bill.method, (totals.get(bill.method) ?? 0) + bill.total);
  return [...totals].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);
}

export function topDrugs(bills: Bill[], limit = 5): { name: string; qty: number }[] {
  const dispensed = new Map<string, number>();
  for (const bill of bills) {
    for (const line of bill.lines) {
      if (line.drugId) dispensed.set(line.name, (dispensed.get(line.name) ?? 0) + line.qty);
    }
  }
  return [...dispensed]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}
