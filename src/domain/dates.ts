// All dates are YYYY-MM-DD strings in East Africa Time. Kenya has no daylight saving, so a fixed
// UTC+3 shift is exact, and doing the arithmetic in UTC keeps results independent of the device zone.
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Today's date in EAT. */
export function today(now: number = Date.now()): string {
  return new Date(now + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The current wall-clock time in EAT, HH:MM. */
export function clockTime(now: number = Date.now()): string {
  return new Date(now + EAT_OFFSET_MS).toISOString().slice(11, 16);
}

/** Milliseconds until the EAT date changes, so a screen left open overnight can roll over to the new day. */
export function msUntilNextDay(now: number = Date.now()): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return DAY_MS - ((now + EAT_OFFSET_MS) % DAY_MS);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(value: string): { y: number; m: number; d: number; date: Date } | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls 2024-02-31 over into March, so only accept dates that survive the round trip.
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? { y, m, d, date } : null;
}

export const isValidDate = (value: string) => parseDate(value) !== null;

export const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Calendar arithmetic on a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  if (!parsed) throw new Error(`Invalid date: ${date}`);
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d + days)).toISOString().slice(0, 10);
}

/** Completed years between `dob` and `onDate`, or null if either is not a valid date. */
export function ageYears(dob: string, onDate: string): number | null {
  const born = parseDate(dob);
  const on = parseDate(onDate);
  if (!born || !on) return null;
  const birthdayPassed = on.m > born.m || (on.m === born.m && on.d >= born.d);
  return Math.max(0, on.y - born.y - (birthdayPassed ? 0 : 1));
}

/** "Thursday, 1 October" */
export function formatLongDate(date: string): string {
  const parsed = parseDate(date);
  if (!parsed) return date;
  return `${WEEKDAYS[parsed.date.getUTCDay()]}, ${parsed.d} ${MONTHS[parsed.m - 1]}`;
}
