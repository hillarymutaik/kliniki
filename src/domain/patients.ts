import { isValidDate } from './dates';
import { fail, hasErrors, ok, type Errors, type Result } from './result';
import type { AppData, Ctx, Patient, Sex } from './types';
import { isValidKenyanPhone, stripWhitespace } from './validation';

/** Raw form values, exactly as typed. */
export interface PatientForm {
  name: string;
  phone: string;
  dob: string;
  sex: Sex;
  sha: string;
  allergies: string;
  consent: boolean;
}

export type PatientField = keyof PatientForm;

const MIN_DOB = '1900-01-01';

function validate(form: PatientForm, today: string, requireConsent: boolean): Errors<PatientField> {
  const errors: Errors<PatientField> = {};
  if (!form.name.trim()) errors.name = 'Enter the patient’s full name.';
  if (!form.phone.trim()) errors.phone = 'Enter a phone number.';
  else if (!isValidKenyanPhone(form.phone)) errors.phone = 'Enter a valid Kenyan phone number, e.g. 0712345678.';
  if (!form.dob.trim()) errors.dob = 'Enter the date of birth.';
  else if (!isValidDate(form.dob) || form.dob < MIN_DOB) errors.dob = 'Enter a valid date of birth as YYYY-MM-DD.';
  else if (form.dob > today) errors.dob = 'Date of birth cannot be in the future.';
  if (requireConsent && !form.consent) errors.consent = 'Consent is needed before storing health records.';
  return errors;
}

function toPatient(id: string, form: PatientForm): Patient {
  return {
    id,
    name: form.name.trim(),
    phone: stripWhitespace(form.phone),
    dob: form.dob.trim(),
    sex: form.sex,
    sha: form.sha.trim(),
    allergies: form.allergies.trim(),
  };
}

export function registerPatient(
  data: AppData,
  form: PatientForm,
  ctx: Ctx,
): Result<{ data: AppData; patient: Patient }, PatientField> {
  const errors = validate(form, ctx.today, true);
  if (hasErrors(errors)) return fail(errors);
  const patient = toPatient(ctx.newId(), form);
  return ok({ data: { ...data, patients: [...data.patients, patient] }, patient });
}

export function updatePatient(
  data: AppData,
  id: string,
  form: PatientForm,
  ctx: Ctx,
): Result<{ data: AppData; patient: Patient }, PatientField> {
  if (!data.patients.some((p) => p.id === id)) return fail({ _form: 'Patient not found.' });
  const errors = validate(form, ctx.today, false);
  if (hasErrors(errors)) return fail(errors);
  const patient = toPatient(id, form);
  return ok({ data: { ...data, patients: data.patients.map((p) => (p.id === id ? patient : p)) }, patient });
}

export function searchPatients(patients: Patient[], query: string): Patient[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  return patients.filter((p) => `${p.name} ${p.phone} ${p.sha}`.toLowerCase().includes(q));
}

export const findPatient = (data: Pick<AppData, 'patients'>, id: string) => data.patients.find((p) => p.id === id);
