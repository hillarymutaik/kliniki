import type { PatientForm } from '@/domain/patients';
import type { Sex } from '@/domain/types';
import { useFormState } from '@/hooks/use-form-state';
import { useActions, useData } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { CheckboxField } from '../ui/CheckboxField';
import { DateField } from '../ui/DateField';
import { FormDialog } from '../ui/Dialog';
import { FormRow } from '../ui/FormRow';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';

const SEX_OPTIONS = [
  { value: 'F', label: 'Female' },
  { value: 'M', label: 'Male' },
];

/** Registers a new patient, or edits one when `patientId` is given. */
export function PatientFormDialog({ patientId, onClose }: { patientId?: string; onClose: () => void }) {
  const data = useData();
  const { registerPatient, updatePatient } = useActions();
  const toast = useToast();
  const existing = patientId ? data.patients.find((p) => p.id === patientId) : undefined;

  const { values, errors, setErrors, field } = useFormState<PatientForm>(() =>
    existing
      ? { ...existing, consent: true }
      : { name: '', phone: '', dob: '', sex: 'F', sha: '', allergies: '', consent: false },
  );

  function submit() {
    const result = existing ? updatePatient(existing.id, values) : registerPatient(values);
    if (!result.ok) return setErrors(result.errors);
    toast(existing ? 'Changes saved' : 'Patient registered');
    onClose();
  }

  const label = existing ? 'Save changes' : 'Register patient';
  return (
    <FormDialog
      title={existing ? 'Edit patient' : 'Register patient'}
      okLabel={label}
      onSubmit={submit}
      onClose={onClose}
      error={errors._form}
    >
      <TextField label="Full name" value={values.name} onChangeText={field('name')} error={errors.name} autoCapitalize="words" />
      <FormRow>
        <TextField
          label="Phone"
          value={values.phone}
          onChangeText={field('phone')}
          error={errors.phone}
          placeholder="07XXXXXXXX"
          keyboardType="phone-pad"
          inputMode="tel"
        />
        <DateField label="Date of birth" value={values.dob} onChange={field('dob')} error={errors.dob} />
      </FormRow>
      <FormRow>
        <SelectField label="Sex" value={values.sex} options={SEX_OPTIONS} onChange={(v) => field('sex')(v as Sex)} />
        <TextField
          label="SHA number (optional)"
          value={values.sha}
          onChangeText={field('sha')}
          autoCapitalize="characters"
        />
      </FormRow>
      <TextField
        label="Known allergies"
        value={values.allergies}
        onChangeText={field('allergies')}
        placeholder="Leave blank if none"
      />
      <CheckboxField
        label="Patient consents to storing their health records"
        checked={values.consent}
        onChange={field('consent')}
        error={errors.consent}
      />
    </FormDialog>
  );
}
