import { fail, hasErrors, ok, type Errors, type Result } from './result';
import { deductFefo, sellable } from './stock';
import type { AppData, Bill, BillLine, Claim, Ctx, Drug, PayMethod, Service } from './types';
import { isValidMpesaCode, padNumber } from './validation';

export interface BillForm {
  patientId: string;
  lines: BillLine[];
  method: PayMethod;
  ref: string;
}

export type BillField = 'patientId' | 'lines' | 'method' | 'ref';

export const lineTotal = (line: BillLine) => line.qty * line.price;
export const billTotal = (lines: BillLine[]) => lines.reduce((sum, line) => sum + lineTotal(line), 0);

/** Services are added as a new line every time. */
export const addServiceLine = (lines: BillLine[], service: Service): BillLine[] => [
  ...lines,
  { name: service.name, qty: 1, price: service.price },
];

/** Adding a drug that is already on the bill raises its quantity instead of adding a second line. */
export function addDrugLine(lines: BillLine[], drug: Drug): BillLine[] {
  if (lines.some((line) => line.drugId === drug.id)) {
    return lines.map((line) => (line.drugId === drug.id ? { ...line, qty: line.qty + 1 } : line));
  }
  return [...lines, { name: drug.name, qty: 1, price: drug.price, drugId: drug.id }];
}

/** Quantities are whole numbers of at least 1; anything else snaps to the nearest valid value. */
export const setLineQty = (lines: BillLine[], index: number, qty: number): BillLine[] =>
  lines.map((line, i) => (i === index ? { ...line, qty: Math.max(1, Math.floor(qty) || 1) } : line));

export const removeLine = (lines: BillLine[], index: number): BillLine[] => lines.filter((_, i) => i !== index);

export function createBill(
  data: AppData,
  form: BillForm,
  ctx: Ctx,
): Result<{ data: AppData; bill: Bill; claim: Claim | null }, BillField> {
  const patient = data.patients.find((p) => p.id === form.patientId);
  const errors: Errors<BillField> = {};

  if (!patient) errors.patientId = 'Select a patient.';
  if (form.lines.length === 0) errors.lines = 'Add at least one service or drug.';
  if (form.method === 'M-Pesa' && !isValidMpesaCode(form.ref)) {
    errors.ref = 'Enter the 10-character M-Pesa confirmation code.';
  }
  if (form.method === 'SHA' && patient && !patient.sha) {
    errors.method = 'This patient has no SHA number. Add it on their profile or choose another payment method.';
  }
  if (!errors.lines) {
    const stockError = findStockError(data.drugs, form.lines, ctx.today);
    if (stockError) errors.lines = stockError;
  }
  if (!patient || hasErrors(errors)) return fail(errors);

  let drugs = data.drugs;
  for (const line of form.lines) {
    if (!line.drugId) continue;
    drugs = drugs.map((d) =>
      d.id === line.drugId ? { ...d, batches: deductFefo(d.batches, line.qty, ctx.today) } : d,
    );
  }

  const total = billTotal(form.lines);
  const bill: Bill = {
    id: ctx.newId(),
    no: `INV-${padNumber(data.bills.length + 1)}`,
    patientId: patient.id,
    date: ctx.today,
    lines: form.lines.map((line) => ({ ...line })),
    method: form.method,
    ref: form.method === 'M-Pesa' ? form.ref.toUpperCase() : '',
    total,
  };
  // Paying through SHA is a claim waiting to be filed, so it is drafted automatically.
  const claim: Claim | null =
    form.method === 'SHA'
      ? {
          id: ctx.newId(),
          no: `CLM-${padNumber(data.claims.length + 1)}`,
          patientId: patient.id,
          date: ctx.today,
          amount: total,
          status: 'Draft',
          billId: bill.id,
        }
      : null;

  return ok({
    data: {
      ...data,
      drugs,
      bills: [...data.bills, bill],
      claims: claim ? [...data.claims, claim] : data.claims,
    },
    bill,
    claim,
  });
}

function findStockError(drugs: Drug[], lines: BillLine[], today: string): string | null {
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) return 'Quantities must be whole numbers of at least 1.';
    if (!line.drugId) continue;
    const drug = drugs.find((d) => d.id === line.drugId);
    if (!drug) return `${line.name} is no longer in the formulary.`;
    const available = sellable(drug, today);
    if (available < line.qty) return `Only ${available} ${drug.unit} of ${drug.name} in stock.`;
  }
  return null;
}
