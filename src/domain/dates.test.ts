import { addDays, ageYears, clockTime, formatLongDate, isValidDate, isValidTime, today } from './dates';
import { formatNumber, kes } from './money';

describe('East Africa Time', () => {
  it('rolls over to the next day at 21:00 UTC, three hours before UTC does', () => {
    expect(today(Date.UTC(2026, 9, 1, 20, 59))).toBe('2026-10-01');
    expect(today(Date.UTC(2026, 9, 1, 21, 0))).toBe('2026-10-02');
    expect(clockTime(Date.UTC(2026, 9, 1, 21, 30))).toBe('00:30');
    expect(clockTime(Date.UTC(2026, 9, 1, 6, 5))).toBe('09:05');
  });
});

describe('addDays', () => {
  it('does calendar arithmetic across months, years and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-01', 60)).toBe('2026-11-30');
    expect(addDays('2026-10-01', 0)).toBe('2026-10-01');
  });

  it('throws on a malformed date instead of producing garbage', () => {
    expect(() => addDays('not-a-date', 1)).toThrow('Invalid date');
  });
});

describe('date and time validation', () => {
  it('rejects dates that only look valid', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2023-02-29')).toBe(false);
    expect(isValidDate('2026-04-31')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-5')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('accepts only 24-hour HH:MM times', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
  });
});

describe('ageYears', () => {
  it('counts completed years and only ticks over on the birthday', () => {
    expect(ageYears('2016-01-05', '2026-01-04')).toBe(9);
    expect(ageYears('2016-01-05', '2026-01-05')).toBe(10);
    expect(ageYears('1988-04-12', '2026-10-01')).toBe(38);
  });

  it('is null for bad input and never negative', () => {
    expect(ageYears('', '2026-10-01')).toBeNull();
    expect(ageYears('2030-01-01', '2026-10-01')).toBe(0);
  });
});

describe('formatLongDate', () => {
  it('gives weekday, day and month', () => {
    expect(formatLongDate('2026-10-01')).toBe('Thursday, 1 October');
    expect(formatLongDate('2026-01-31')).toBe('Saturday, 31 January');
  });
});

describe('money', () => {
  it('groups thousands without relying on Intl', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-1500)).toBe('-1,500');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(0.126)).toBe('0.13');
  });

  it('formats Kenyan shillings and tolerates missing values', () => {
    expect(kes(1750)).toBe('KES 1,750');
    expect(kes(null)).toBe('KES 0');
    expect(kes(undefined)).toBe('KES 0');
    expect(kes(NaN)).toBe('KES 0');
  });
});
