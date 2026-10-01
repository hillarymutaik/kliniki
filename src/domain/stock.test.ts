import { TODAY } from './testing';
import {
  deductFefo,
  hasExpiredStock,
  hasExpiringStock,
  nearestBatch,
  onHand,
  sellable,
  stockStatus,
  stockValue,
} from './stock';
import { addDays } from './dates';
import type { Drug } from './types';

const drug = (overrides: Partial<Drug> = {}): Drug => ({
  id: 'd',
  name: 'Test drug',
  unit: 'tabs',
  price: 10,
  reorder: 20,
  batches: [{ no: 'B1', qty: 100, exp: addDays(TODAY, 300) }],
  ...overrides,
});

describe('stock counts', () => {
  const mixed = drug({
    batches: [
      { no: 'OLD', qty: 30, exp: addDays(TODAY, -1) },
      { no: 'NEW', qty: 50, exp: addDays(TODAY, 90) },
    ],
  });

  it('counts expired batches on the shelf but not as sellable', () => {
    expect(onHand(mixed)).toBe(80);
    expect(sellable(mixed, TODAY)).toBe(50);
  });

  it('treats a batch that expires today as expired', () => {
    const d = drug({ batches: [{ no: 'B', qty: 10, exp: TODAY }] });
    expect(sellable(d, TODAY)).toBe(0);
  });

  it('values only what can still be sold', () => {
    expect(stockValue([mixed, drug()], TODAY)).toBe(50 * 10 + 100 * 10);
  });
});

describe('stockStatus', () => {
  it('is out at zero, reorder at or below the level, otherwise ok', () => {
    expect(stockStatus(drug({ batches: [{ no: 'B', qty: 0, exp: addDays(TODAY, 90) }] }), TODAY)).toBe('out');
    expect(stockStatus(drug({ batches: [{ no: 'B', qty: 20, exp: addDays(TODAY, 90) }] }), TODAY)).toBe('reorder');
    expect(stockStatus(drug({ batches: [{ no: 'B', qty: 21, exp: addDays(TODAY, 90) }] }), TODAY)).toBe('ok');
  });

  it('reports a drug whose only stock has expired as out, not ok', () => {
    const d = drug({ batches: [{ no: 'B', qty: 500, exp: addDays(TODAY, -5) }] });
    expect(stockStatus(d, TODAY)).toBe('out');
    expect(hasExpiredStock(d, TODAY)).toBe(true);
  });
});

describe('expiry warnings', () => {
  const withExpiry = (exp: string, qty = 5) => drug({ batches: [{ no: 'B', qty, exp }] });

  it('warns up to and including 60 days out', () => {
    expect(hasExpiringStock(withExpiry(addDays(TODAY, 60)), TODAY)).toBe(true);
    expect(hasExpiringStock(withExpiry(addDays(TODAY, 61)), TODAY)).toBe(false);
  });

  it('includes stock that has already expired', () => {
    expect(hasExpiringStock(withExpiry(addDays(TODAY, -10)), TODAY)).toBe(true);
  });

  it('ignores empty batches', () => {
    expect(hasExpiringStock(withExpiry(addDays(TODAY, 10), 0), TODAY)).toBe(false);
  });
});

describe('nearestBatch', () => {
  it('picks the soonest expiry among batches that still have stock', () => {
    const d = drug({
      batches: [
        { no: 'EMPTY', qty: 0, exp: addDays(TODAY, 5) },
        { no: 'LATE', qty: 9, exp: addDays(TODAY, 200) },
        { no: 'SOON', qty: 9, exp: addDays(TODAY, 40) },
      ],
    });
    expect(nearestBatch(d)?.no).toBe('SOON');
  });

  it('is undefined when everything is used up', () => {
    expect(nearestBatch(drug({ batches: [{ no: 'B', qty: 0, exp: addDays(TODAY, 5) }] }))).toBeUndefined();
  });
});

describe('deductFefo', () => {
  const batches = [
    { no: 'LATE', qty: 10, exp: addDays(TODAY, 200) },
    { no: 'SOON', qty: 3, exp: addDays(TODAY, 30) },
  ];

  it('empties the batch that expires first, then carries on into the next', () => {
    const after = deductFefo(batches, 5, TODAY);
    expect(after.map((b) => [b.no, b.qty])).toEqual([
      ['SOON', 0],
      ['LATE', 8],
    ]);
  });

  it('never touches an expired batch, even though it expires first', () => {
    const withExpired = [{ no: 'DEAD', qty: 7, exp: addDays(TODAY, -2) }, ...batches];
    const after = deductFefo(withExpired, 4, TODAY);
    expect(after.find((b) => b.no === 'DEAD')?.qty).toBe(7);
    expect(after.find((b) => b.no === 'SOON')?.qty).toBe(0);
    expect(after.find((b) => b.no === 'LATE')?.qty).toBe(9);
  });

  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(batches));
    deductFefo(batches, 5, TODAY);
    expect(batches).toEqual(copy);
  });
});
