import { setClaimStatus, nextClaimStatuses } from './claims';
import { billsToCsv } from './csv';
import { addDays } from './dates';
import { dashboardStats, revenueByDay, revenueByMethod, topDrugs } from './stats';
import { expectOk, freshData, TODAY } from './testing';
import type { Bill } from './types';

const bill = (overrides: Partial<Bill>): Bill => ({
  id: 'b',
  no: 'INV-X',
  patientId: 'pat-1',
  date: TODAY,
  lines: [],
  method: 'Cash',
  ref: '',
  total: 0,
  ...overrides,
});

describe('seed data', () => {
  it('starts the dashboard at the figures the prototype showed', () => {
    expect(dashboardStats(freshData(), TODAY)).toEqual({
      inQueue: 2,
      collectedToday: 1750,
      lowStock: 2,
      expiring: 2,
      pendingClaims: { count: 1, amount: 2400 },
    });
  });
});

describe('dashboardStats', () => {
  it('only counts today for the queue and the takings', () => {
    const data = freshData();
    data.appointments.push({
      id: 'old',
      patientId: 'pat-1',
      date: addDays(TODAY, -1),
      time: '09:00',
      reason: 'x',
      status: 'waiting',
      queueNo: 1,
    });
    data.bills.push(bill({ id: 'yday', date: addDays(TODAY, -1), total: 9999 }));
    const stats = dashboardStats(data, TODAY);
    expect(stats.inQueue).toBe(2);
    expect(stats.collectedToday).toBe(1750);
  });

  it('counts draft and submitted claims as pending, not decided ones', () => {
    const data = freshData();
    data.claims.push(
      { id: 'c2', no: 'CLM-0002', patientId: 'pat-1', date: TODAY, amount: 500, status: 'Draft', billId: null },
      { id: 'c3', no: 'CLM-0003', patientId: 'pat-1', date: TODAY, amount: 700, status: 'Approved', billId: null },
      { id: 'c4', no: 'CLM-0004', patientId: 'pat-1', date: TODAY, amount: 900, status: 'Rejected', billId: null },
    );
    expect(dashboardStats(data, TODAY).pendingClaims).toEqual({ count: 2, amount: 2900 });
  });

  it('counts a drug with nothing left to sell as at reorder level', () => {
    const data = freshData();
    data.drugs = data.drugs.map((d) =>
      d.id === 'drg-4' ? { ...d, batches: [{ no: 'X', qty: 999, exp: addDays(TODAY, -1) }] } : d,
    );
    expect(dashboardStats(data, TODAY).lowStock).toBe(3);
  });
});

describe('revenueByDay', () => {
  it('returns seven days, oldest first, ending today, with gaps as zero', () => {
    const bills = [
      bill({ id: '1', date: TODAY, total: 300 }),
      bill({ id: '2', date: TODAY, total: 200 }),
      bill({ id: '3', date: addDays(TODAY, -2), total: 1000 }),
      bill({ id: '4', date: addDays(TODAY, -9), total: 5000 }),
    ];
    const days = revenueByDay(bills, TODAY);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(addDays(TODAY, -6));
    expect(days[6]).toEqual({ date: TODAY, total: 500 });
    expect(days[4]).toEqual({ date: addDays(TODAY, -2), total: 1000 });
    expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(1500);
  });
});

describe('revenueByMethod and topDrugs', () => {
  const bills = [
    bill({ id: '1', method: 'Cash', total: 500 }),
    bill({ id: '2', method: 'M-Pesa', total: 1750 }),
    bill({ id: '3', method: 'Cash', total: 600 }),
    bill({
      id: '4',
      lines: [
        { name: 'Consultation', qty: 1, price: 1000 },
        { name: 'ORS sachets', qty: 4, price: 30, drugId: 'drg-4' },
        { name: 'Amoxicillin 500mg caps', qty: 21, price: 15, drugId: 'drg-1' },
      ],
    }),
    bill({ id: '5', lines: [{ name: 'ORS sachets', qty: 3, price: 30, drugId: 'drg-4' }] }),
  ];

  it('ranks payment methods by revenue', () => {
    expect(revenueByMethod(bills)).toEqual([
      { method: 'M-Pesa', total: 1750 },
      { method: 'Cash', total: 1100 },
    ]);
  });

  it('ranks dispensed drugs by quantity and leaves services out', () => {
    expect(topDrugs(bills)).toEqual([
      { name: 'Amoxicillin 500mg caps', qty: 21 },
      { name: 'ORS sachets', qty: 7 },
    ]);
  });

  it('keeps only the top five', () => {
    const many = bill({
      lines: Array.from({ length: 8 }, (_, i) => ({ name: `Drug ${i}`, qty: i + 1, price: 1, drugId: `d${i}` })),
    });
    const top = topDrugs([many]);
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ name: 'Drug 7', qty: 8 });
  });
});

describe('claims', () => {
  it('moves forward through the lifecycle only', () => {
    expect(nextClaimStatuses('Draft')).toEqual(['Submitted']);
    expect(nextClaimStatuses('Submitted')).toEqual(['Approved', 'Rejected']);
    expect(nextClaimStatuses('Approved')).toEqual([]);

    const data = freshData();
    const approved = expectOk(setClaimStatus(data, 'clm-1', 'Approved')).data;
    expect(approved.claims[0].status).toBe('Approved');
    expect(setClaimStatus(approved, 'clm-1', 'Rejected')).toEqual({
      ok: false,
      errors: { _form: 'A claim that is approved cannot be marked rejected.' },
    });
  });

  it('will not skip drafting', () => {
    const data = freshData();
    data.claims[0] = { ...data.claims[0], status: 'Draft' };
    expect(setClaimStatus(data, 'clm-1', 'Approved').ok).toBe(false);
  });

  it('fails for an unknown claim', () => {
    expect(setClaimStatus(freshData(), 'nope', 'Submitted')).toEqual({
      ok: false,
      errors: { _form: 'Claim not found.' },
    });
  });
});

describe('billsToCsv', () => {
  it('writes a header and one quoted row per bill', () => {
    const data = freshData();
    expect(billsToCsv(data.bills, data.patients)).toBe(
      ['"Invoice","Date","Patient","Method","Ref","Total"', `"INV-0001","${TODAY}","Wanjiru Kamau","M-Pesa","SIJ4K2LQ8P","1750"`].join('\n'),
    );
  });

  it('escapes quotes and defuses spreadsheet formulas in names', () => {
    const patients = [{ ...freshData().patients[0], id: 'x', name: '=HYPERLINK("http://evil")' }];
    const csv = billsToCsv([bill({ patientId: 'x', total: 10 })], patients);
    expect(csv.split('\n')[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('shows Unknown for a bill whose patient is gone', () => {
    expect(billsToCsv([bill({ patientId: 'gone' })], [])).toContain('"Unknown"');
  });
});
