import { fail, ok, type Result } from './result';
import type { AppData } from './types';

export const CLINIC_NAME_MAX = 80;

export function renameClinic(data: AppData, name: string): Result<{ data: AppData }, 'name'> {
  const trimmed = name.trim();
  if (!trimmed) return fail({ name: 'Enter the clinic name.' });
  if (trimmed.length > CLINIC_NAME_MAX) return fail({ name: `Keep the clinic name under ${CLINIC_NAME_MAX} characters.` });
  return ok({ data: { ...data, clinic: trimmed } });
}

/**
 * Removes everyone's records: patients and everything that belongs to them (visits, bills, claims).
 * The formulary and stock levels are kept, because the drugs on the shelf are still there.
 */
export function erasePatientRecords(data: AppData): AppData {
  return { ...data, patients: [], appointments: [], bills: [], claims: [] };
}

/** Everything on the device as readable JSON, for backup or handing over to the patient's own provider. */
export const exportAllData = (data: AppData): string => JSON.stringify(data, null, 2);
