import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { advanceAppointment, bookAppointment, type AppointmentForm } from '@/domain/appointments';
import { createBill, type BillForm } from '@/domain/billing';
import { setClaimStatus } from '@/domain/claims';
import { erasePatientRecords, renameClinic } from '@/domain/clinic';
import { today } from '@/domain/dates';
import { addDrug, receiveStock, type DrugForm, type StockForm } from '@/domain/drugs';
import { newId } from '@/domain/ids';
import { registerPatient, updatePatient, type PatientForm } from '@/domain/patients';
import type { Result } from '@/domain/result';
import { seedData } from '@/domain/seed';
import type { AppData, ClaimStatus, Ctx } from '@/domain/types';

export const STORAGE_KEY = 'kliniki_v1';

/** Every mutation goes through here. Each one returns the domain result so forms can show its errors. */
export interface Actions {
  registerPatient(form: PatientForm): ReturnType<typeof registerPatient>;
  updatePatient(id: string, form: PatientForm): ReturnType<typeof updatePatient>;
  bookAppointment(form: AppointmentForm): ReturnType<typeof bookAppointment>;
  advanceAppointment(id: string): ReturnType<typeof advanceAppointment>;
  addDrug(form: DrugForm): ReturnType<typeof addDrug>;
  receiveStock(drugId: string, form: StockForm): ReturnType<typeof receiveStock>;
  createBill(form: BillForm): ReturnType<typeof createBill>;
  setClaimStatus(id: string, status: ClaimStatus): ReturnType<typeof setClaimStatus>;
  renameClinic(name: string): ReturnType<typeof renameClinic>;
  /** Deletes patients, visits, bills and claims; the pharmacy is kept. */
  erasePatientRecords(): void;
  /** Replaces everything with the demo data. */
  resetDemoData(): void;
}

export interface KlinikiState {
  data: AppData;
  /** Created once, so selecting it never triggers a re-render. */
  actions: Actions;
  /** False until saved data has been read back, or reading it has failed. Never persisted. */
  ready: boolean;
}

const runtimeCtx = (): Ctx => ({ today: today(), newId });

/** Guards against corrupt or hand-edited storage: anything that is not the expected shape is ignored. */
export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clinic === 'string' &&
    ['patients', 'drugs', 'services', 'appointments', 'bills', 'claims'].every((key) => Array.isArray(v[key]))
  );
}

/** A failed save (full disk, blocked site data) must never crash a clinic mid-bill, so it is only logged. */
const storage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.warn('Could not save data on this device.', error);
    }
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
};

export const useKlinikiStore = create<KlinikiState>()(
  persist(
    (set, get) => {
      /** Keeps the new data when a domain action succeeds, and hands the result back either way. */
      const commit = <R extends Result<{ data: AppData }, string>>(result: R): R => {
        if (result.ok) set({ data: result.value.data });
        return result;
      };

      return {
        data: seedData(today()),
        ready: false,
        actions: {
          registerPatient: (form) => commit(registerPatient(get().data, form, runtimeCtx())),
          updatePatient: (id, form) => commit(updatePatient(get().data, id, form, runtimeCtx())),
          bookAppointment: (form) => commit(bookAppointment(get().data, form, runtimeCtx())),
          advanceAppointment: (id) => commit(advanceAppointment(get().data, id)),
          addDrug: (form) => commit(addDrug(get().data, form, runtimeCtx())),
          receiveStock: (drugId, form) => commit(receiveStock(get().data, drugId, form, runtimeCtx())),
          createBill: (form) => commit(createBill(get().data, form, runtimeCtx())),
          setClaimStatus: (id, status) => commit(setClaimStatus(get().data, id, status)),
          renameClinic: (name) => commit(renameClinic(get().data, name)),
          erasePatientRecords: () => set({ data: erasePatientRecords(get().data) }),
          resetDemoData: () => set({ data: seedData(today()) }),
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ data: state.data }),
      merge: (persisted, current) => {
        const stored = (persisted as { data?: unknown } | undefined)?.data;
        return isAppData(stored) ? { ...current, data: stored } : current;
      },
      // Zustand never reports a failed read as "finished hydrating", so the app would wait on a
      // blank screen forever. Whatever happened, start up with what we have (the demo data on failure).
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('Could not read saved data, starting from the demo data.', error);
        useKlinikiStore.setState({ ready: true });
      },
    },
  ),
);
