import type { Bill, Patient } from './types';

// Spreadsheet apps execute cells that start with these characters as formulas, and a patient name
// is attacker-controlled text, so such cells are defused with a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number): string {
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function billsToCsv(bills: Bill[], patients: Patient[]): string {
  const nameOf = (id: string) => patients.find((p) => p.id === id)?.name ?? 'Unknown';
  const rows: (string | number)[][] = [
    ['Invoice', 'Date', 'Patient', 'Method', 'Ref', 'Total'],
    ...bills.map((b) => [b.no, b.date, nameOf(b.patientId), b.method, b.ref, b.total]),
  ];
  return rows.map((row) => row.map(cell).join(',')).join('\n');
}
