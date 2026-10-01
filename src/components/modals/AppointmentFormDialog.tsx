import { useMemo } from 'react';

import type { AppointmentForm } from '@/domain/appointments';
import { clockTime, today } from '@/domain/dates';
import { useFormState } from '@/hooks/use-form-state';
import { useActions, useData } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { DateField } from '../ui/DateField';
import { FormDialog } from '../ui/Dialog';
import { FormRow } from '../ui/FormRow';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';
import { TimeField } from '../ui/TimeField';

/** Books an appointment. A walk-in is always for today and joins the queue straight away. */
export function AppointmentFormDialog({ walkIn, onClose }: { walkIn: boolean; onClose: () => void }) {
  const data = useData();
  const { bookAppointment } = useActions();
  const toast = useToast();

  const { values, errors, setErrors, field } = useFormState<AppointmentForm>(() => ({
    patientId: data.patients[0]?.id ?? '',
    date: today(),
    time: clockTime(),
    reason: '',
  }));

  const patients = useMemo(
    () => data.patients.map((p) => ({ value: p.id, label: `${p.name} (${p.phone})` })),
    [data.patients],
  );

  function submit() {
    const result = bookAppointment(values);
    if (!result.ok) return setErrors(result.errors);
    toast(`Queue number ${result.value.appointment.queueNo} assigned`);
    onClose();
  }

  return (
    <FormDialog
      title={walkIn ? 'Add walk-in' : 'Book appointment'}
      okLabel={walkIn ? 'Add to queue' : 'Book appointment'}
      onSubmit={submit}
      onClose={onClose}
      error={errors._form}
    >
      <SelectField
        label="Patient"
        value={values.patientId}
        options={patients}
        onChange={field('patientId')}
        error={errors.patientId}
      />
      <FormRow>
        <DateField label="Date" value={values.date} onChange={field('date')} error={errors.date} readOnly={walkIn} />
        <TimeField label="Time (EAT)" value={values.time} onChange={field('time')} error={errors.time} />
      </FormRow>
      <TextField
        label="Reason for visit"
        value={values.reason}
        onChangeText={field('reason')}
        error={errors.reason}
        placeholder="e.g. Fever, cough"
        autoCapitalize="sentences"
      />
    </FormDialog>
  );
}
