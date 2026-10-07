import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useKlinikiStore } from '@/store/store';

import { useToast } from '../feedback/Toast';
import { ConfirmDialog } from '../ui/Dialog';
import { AppointmentFormDialog } from './AppointmentFormDialog';
import { BillDialog } from './BillDialog';
import { ClinicFormDialog } from './ClinicFormDialog';
import { DrugFormDialog } from './DrugFormDialog';
import { PatientFormDialog } from './PatientFormDialog';
import { ProfileFormDialog } from './ProfileFormDialog';
import { QuickActionsSheet } from './QuickActionsSheet';
import { RestockDialog } from './RestockDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

type ModalState =
  | { type: 'patient'; patientId?: string }
  | { type: 'appointment'; walkIn: boolean }
  | { type: 'drug' }
  | { type: 'restock'; drugId: string }
  | { type: 'bill'; patientId?: string }
  | { type: 'profile' }
  | { type: 'quick' }
  | { type: 'clinic' }
  | ({ type: 'confirm' } & ConfirmOptions);

/** Any screen can open any dialog, the way the prototype's global addPatient() and newBill() helpers did. */
export interface ModalApi {
  openPatientForm(patientId?: string): void;
  openAppointmentForm(options?: { walkIn?: boolean }): void;
  openDrugForm(): void;
  openRestock(drugId: string): void;
  openBill(patientId?: string): void;
  openProfile(): void;
  openQuickActions(): void;
  openClinic(): void;
  confirm(options: ConfirmOptions): void;
}

const ModalContext = createContext<ModalApi | null>(null);

export function useModals(): ModalApi {
  const api = useContext(ModalContext);
  if (!api) throw new Error('useModals must be used inside <ModalHost>');
  return api;
}

/** Owns the one dialog that can be open at a time. */
export function ModalHost({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [modal, setModal] = useState<ModalState | null>(null);
  const close = useCallback(() => setModal(null), []);

  const api = useMemo<ModalApi>(() => {
    /** Appointments and bills belong to a patient, so with none registered the patient form opens instead. */
    const lacksPatients = () => {
      if (useKlinikiStore.getState().data.patients.length > 0) return false;
      toast('Register a patient first');
      setModal({ type: 'patient' });
      return true;
    };

    return {
      openPatientForm: (patientId) => setModal({ type: 'patient', patientId }),
      openAppointmentForm: (options) => {
        if (!lacksPatients()) setModal({ type: 'appointment', walkIn: !!options?.walkIn });
      },
      openDrugForm: () => setModal({ type: 'drug' }),
      openRestock: (drugId) => setModal({ type: 'restock', drugId }),
      openBill: (patientId) => {
        if (!lacksPatients()) setModal({ type: 'bill', patientId });
      },
      openProfile: () => setModal({ type: 'profile' }),
      openQuickActions: () => setModal({ type: 'quick' }),
      openClinic: () => setModal({ type: 'clinic' }),
      confirm: (options) => setModal({ type: 'confirm', ...options }),
    };
  }, [toast]);

  return (
    <ModalContext.Provider value={api}>
      {children}
      {modal?.type === 'patient' ? <PatientFormDialog patientId={modal.patientId} onClose={close} /> : null}
      {modal?.type === 'appointment' ? <AppointmentFormDialog walkIn={modal.walkIn} onClose={close} /> : null}
      {modal?.type === 'drug' ? <DrugFormDialog onClose={close} /> : null}
      {modal?.type === 'restock' ? <RestockDialog drugId={modal.drugId} onClose={close} /> : null}
      {modal?.type === 'bill' ? <BillDialog patientId={modal.patientId} onClose={close} /> : null}
      {modal?.type === 'quick' ? <QuickActionsSheet api={api} onClose={close} /> : null}
      {modal?.type === 'profile' ? <ProfileFormDialog onClose={close} /> : null}
      {modal?.type === 'clinic' ? <ClinicFormDialog onClose={close} /> : null}
      {modal?.type === 'confirm' ? (
        <ConfirmDialog
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          destructive={modal.destructive}
          onConfirm={modal.onConfirm}
          onClose={close}
        />
      ) : null}
    </ModalContext.Provider>
  );
}
