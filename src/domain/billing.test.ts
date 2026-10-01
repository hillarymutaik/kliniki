import {
  addDrugLine,
  addServiceLine,
  billTotal,
  createBill,
  removeLine,
  setLineQty,
  type BillForm,
} from './billing';
import { addDays } from './dates';
import { expectOk, freshData, makeCtx, TODAY } from './testing';
import type { AppData, BillLine } from './types';

const al = (data: AppData) => data.drugs.find((d) => d.id === 'drg-3')!;
const amoxicillin = (data: AppData) => data.drugs.find((d) => d.id === 'drg-1')!;

const form = (overrides: Partial<BillForm> = {}): BillForm => ({
  patientId: 'pat-2',
  lines: [{ name: 'Consultation', qty: 1, price: 1000 }],
  method: 'Cash',
  ref: '',
  ...overrides,
});

describe('building up a bill', () => {
  const data = freshData();

  it('adds a service as a new line every time', () => {
    const service = data.services[0];
    const lines = addServiceLine(addServiceLine([], service), service);
    expect(lines).toHaveLength(2);
  });

  it('merges a drug that is added twice into one line with a higher quantity', () => {
    const lines = addDrugLine(addDrugLine([], amoxicillin(data)), amoxicillin(data));
    expect(lines).toEqual([{ name: 'Amoxicillin 500mg caps', qty: 2, price: 15, drugId: 'drg-1' }]);
  });

  it('snaps quantities to whole numbers of at least 1', () => {
    const lines: BillLine[] = [{ name: 'x', qty: 3, price: 5 }];
    expect(setLineQty(lines, 0, 0)[0].qty).toBe(1);
    expect(setLineQty(lines, 0, -4)[0].qty).toBe(1);
    expect(setLineQty(lines, 0, 2.9)[0].qty).toBe(2);
    expect(setLineQty(lines, 0, NaN)[0].qty).toBe(1);
    expect(setLineQty(lines, 0, 12)[0].qty).toBe(12);
  });

  it('removes a line by index and totals the rest', () => {
    const lines: BillLine[] = [
      { name: 'a', qty: 2, price: 100 },
      { name: 'b', qty: 1, price: 50 },
    ];
    expect(billTotal(lines)).toBe(250);
    expect(billTotal(removeLine(lines, 0))).toBe(50);
  });
});

describe('createBill', () => {
  it('saves a cash bill with the next invoice number and no M-Pesa reference', () => {
    const data = freshData();
    const { data: next, bill, claim } = expectOk(createBill(data, form({ ref: 'ignored' }), makeCtx()));
    expect(bill.no).toBe('INV-0002');
    expect(bill.total).toBe(1000);
    expect(bill.ref).toBe('');
    expect(bill.date).toBe(TODAY);
    expect(claim).toBeNull();
    expect(next.bills).toHaveLength(2);
    expect(next.claims).toHaveLength(1);
  });

  it('requires a 10-character alphanumeric M-Pesa code and stores it in capitals', () => {
    const data = freshData();
    const bad = createBill(data, form({ method: 'M-Pesa', ref: 'SIJ4K2' }), makeCtx());
    expect(bad).toEqual({ ok: false, errors: { ref: 'Enter the 10-character M-Pesa confirmation code.' } });

    const withSymbol = createBill(data, form({ method: 'M-Pesa', ref: 'SIJ4K2LQ8!' }), makeCtx());
    expect(withSymbol.ok).toBe(false);

    const good = expectOk(createBill(data, form({ method: 'M-Pesa', ref: 'sij4k2lq8p' }), makeCtx()));
    expect(good.bill.ref).toBe('SIJ4K2LQ8P');
  });

  it('refuses SHA for a patient without a SHA number', () => {
    const data = freshData();
    const result = createBill(data, form({ patientId: 'pat-3', method: 'SHA' }), makeCtx());
    expect(result).toEqual({
      ok: false,
      errors: { method: 'This patient has no SHA number. Add it on their profile or choose another payment method.' },
    });
  });

  it('drafts a claim for the full amount when paid through SHA', () => {
    const data = freshData();
    const lines: BillLine[] = [
      { name: 'Consultation', qty: 1, price: 1000 },
      { name: 'Malaria RDT', qty: 2, price: 400 },
    ];
    const { data: next, bill, claim } = expectOk(createBill(data, form({ method: 'SHA', lines }), makeCtx()));
    expect(bill.total).toBe(1800);
    expect(claim).toMatchObject({
      no: 'CLM-0002',
      patientId: 'pat-2',
      amount: 1800,
      status: 'Draft',
      billId: bill.id,
      date: TODAY,
    });
    expect(next.claims).toHaveLength(2);
  });

  it('needs at least one line', () => {
    const result = createBill(freshData(), form({ lines: [] }), makeCtx());
    expect(result).toEqual({ ok: false, errors: { lines: 'Add at least one service or drug.' } });
  });

  it('needs a patient who exists', () => {
    const result = createBill(freshData(), form({ patientId: 'nobody' }), makeCtx());
    expect(result).toEqual({ ok: false, errors: { patientId: 'Select a patient.' } });
  });

  it('reports every problem at once', () => {
    const result = createBill(freshData(), form({ lines: [], method: 'M-Pesa', ref: '' }), makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['lines', 'ref']);
  });
});

describe('createBill and stock', () => {
  it('deducts dispensed drugs from stock', () => {
    const data = freshData();
    const lines = addDrugLine([], amoxicillin(data)).map((l) => ({ ...l, qty: 20 }));
    const { data: next } = expectOk(createBill(data, form({ lines }), makeCtx()));
    expect(next.drugs.find((d) => d.id === 'drg-1')!.batches[0].qty).toBe(400);
  });

  it('draws on the batch that expires first and spills into the next', () => {
    const data = freshData();
    data.drugs = data.drugs.map((d) =>
      d.id === 'drg-1'
        ? {
            ...d,
            batches: [
              { no: 'LATE', qty: 100, exp: addDays(TODAY, 300) },
              { no: 'SOON', qty: 6, exp: addDays(TODAY, 90) },
            ],
          }
        : d,
    );
    const lines: BillLine[] = [{ name: 'Amoxicillin 500mg caps', qty: 10, price: 15, drugId: 'drg-1' }];
    const { data: next } = expectOk(createBill(data, form({ lines }), makeCtx()));
    const batches = Object.fromEntries(next.drugs.find((d) => d.id === 'drg-1')!.batches.map((b) => [b.no, b.qty]));
    expect(batches).toEqual({ SOON: 0, LATE: 96 });
  });

  it('refuses to oversell and leaves the data untouched', () => {
    const data = freshData();
    const before = JSON.stringify(data);
    const lines: BillLine[] = [{ name: al(data).name, qty: 39, price: 350, drugId: 'drg-3' }];
    const result = createBill(data, form({ lines }), makeCtx());
    expect(result).toEqual({
      ok: false,
      errors: { lines: 'Only 38 packs of Artemether/Lumefantrine 20/120 in stock.' },
    });
    expect(JSON.stringify(data)).toBe(before);
  });

  it('can sell exactly what is left', () => {
    const data = freshData();
    const lines: BillLine[] = [{ name: al(data).name, qty: 38, price: 350, drugId: 'drg-3' }];
    const { data: next } = expectOk(createBill(data, form({ lines }), makeCtx()));
    expect(next.drugs.find((d) => d.id === 'drg-3')!.batches[0].qty).toBe(0);
  });

  it('never dispenses expired stock', () => {
    const data = freshData();
    data.drugs = data.drugs.map((d) =>
      d.id === 'drg-1' ? { ...d, batches: [{ no: 'DEAD', qty: 500, exp: addDays(TODAY, -3) }] } : d,
    );
    const lines: BillLine[] = [{ name: 'Amoxicillin 500mg caps', qty: 1, price: 15, drugId: 'drg-1' }];
    const result = createBill(data, form({ lines }), makeCtx());
    expect(result).toEqual({ ok: false, errors: { lines: 'Only 0 caps of Amoxicillin 500mg caps in stock.' } });
  });

  it('rejects a quantity that is not a positive whole number', () => {
    const lines: BillLine[] = [{ name: 'Consultation', qty: 0, price: 1000 }];
    expect(createBill(freshData(), form({ lines }), makeCtx()).ok).toBe(false);
    const fractional: BillLine[] = [{ name: 'Consultation', qty: 1.5, price: 1000 }];
    expect(createBill(freshData(), form({ lines: fractional }), makeCtx()).ok).toBe(false);
  });

  it('does not mutate the data it was given', () => {
    const data = freshData();
    const before = JSON.stringify(data);
    const lines: BillLine[] = [{ name: 'Amoxicillin 500mg caps', qty: 5, price: 15, drugId: 'drg-1' }];
    expectOk(createBill(data, form({ lines, method: 'SHA', patientId: 'pat-1' }), makeCtx()));
    expect(JSON.stringify(data)).toBe(before);
  });
});
