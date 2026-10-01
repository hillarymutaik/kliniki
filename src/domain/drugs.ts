import { isValidDate } from './dates';
import { fail, hasErrors, ok, type Errors, type Result } from './result';
import type { AppData, Batch, Ctx, Drug } from './types';
import { parseWhole } from './validation';

/** Raw form values, exactly as typed. */
export interface DrugForm {
  name: string;
  unit: string;
  price: string;
  reorder: string;
  batchNo: string;
  qty: string;
  exp: string;
}

export type DrugField = keyof DrugForm;

export interface StockForm {
  batchNo: string;
  qty: string;
  exp: string;
}

export type StockField = keyof StockForm;

const EXPIRED_MESSAGE = 'This batch has already expired. Check the expiry date.';

function validateBatch(form: StockForm, today: string): Errors<StockField> {
  const errors: Errors<StockField> = {};
  const qty = parseWhole(form.qty);
  if (!form.batchNo.trim()) errors.batchNo = 'Enter the batch number.';
  if (qty === null || qty < 1) errors.qty = 'Enter the quantity received, a whole number of at least 1.';
  if (!form.exp.trim()) errors.exp = 'Enter the expiry date.';
  else if (!isValidDate(form.exp)) errors.exp = 'Enter a valid expiry date as YYYY-MM-DD.';
  else if (form.exp <= today) errors.exp = EXPIRED_MESSAGE;
  return errors;
}

const toBatch = (form: StockForm): Batch => ({
  no: form.batchNo.trim(),
  qty: parseWhole(form.qty) ?? 0,
  exp: form.exp.trim(),
});

export function addDrug(data: AppData, form: DrugForm, ctx: Ctx): Result<{ data: AppData; drug: Drug }, DrugField> {
  const errors: Errors<DrugField> = validateBatch(form, ctx.today);
  if (!form.name.trim()) errors.name = 'Enter the drug name and strength.';
  if (!form.unit.trim()) errors.unit = 'Enter the unit, e.g. tabs.';
  if (parseWhole(form.price) === null) errors.price = 'Enter the selling price in KES as a whole number.';
  if (parseWhole(form.reorder) === null) errors.reorder = 'Enter the reorder level, 0 or more.';
  if (hasErrors(errors)) return fail(errors);

  const drug: Drug = {
    id: ctx.newId(),
    name: form.name.trim(),
    unit: form.unit.trim(),
    price: parseWhole(form.price) ?? 0,
    reorder: parseWhole(form.reorder) ?? 0,
    batches: [toBatch(form)],
  };
  return ok({ data: { ...data, drugs: [...data.drugs, drug] }, drug });
}

export function receiveStock(
  data: AppData,
  drugId: string,
  form: StockForm,
  ctx: Ctx,
): Result<{ data: AppData; drug: Drug; batch: Batch }, StockField> {
  const existing = data.drugs.find((d) => d.id === drugId);
  if (!existing) return fail({ _form: 'Drug not found.' });
  const errors = validateBatch(form, ctx.today);
  if (hasErrors(errors)) return fail(errors);

  const batch = toBatch(form);
  const drug: Drug = { ...existing, batches: [...existing.batches, batch] };
  return ok({ data: { ...data, drugs: data.drugs.map((d) => (d.id === drugId ? drug : d)) }, drug, batch });
}

export function searchDrugs(drugs: Drug[], query: string): Drug[] {
  const q = query.trim().toLowerCase();
  if (!q) return drugs;
  return drugs.filter((d) => d.name.toLowerCase().includes(q));
}
