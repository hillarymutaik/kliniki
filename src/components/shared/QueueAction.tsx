import type { Appointment } from '@/domain/types';
import { useActions } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { useModals } from '../modals/ModalHost';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';

/** The next step for a patient in the queue: call them in, then finish and bill. */
export function QueueAction({ appointment }: { appointment: Appointment }) {
  const { advanceAppointment } = useActions();
  const toast = useToast();
  const modals = useModals();

  if (appointment.status === 'waiting') {
    return (
      <Button
        size="sm"
        label="Call in"
        onPress={() => {
          advanceAppointment(appointment.id);
          toast('Patient called in');
        }}
      />
    );
  }

  if (appointment.status === 'consult') {
    return (
      <Button
        size="sm"
        label="Finish & bill"
        onPress={() => {
          // The patient counts as seen even if the bill is then cancelled, as in the prototype.
          advanceAppointment(appointment.id);
          modals.openBill(appointment.patientId);
        }}
      />
    );
  }

  return <Tag tone="green">Seen</Tag>;
}
