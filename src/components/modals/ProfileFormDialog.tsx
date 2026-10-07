import { ROLES, validateProfile, type ProfileForm, type Role } from '@/domain/profile';
import { useFormState } from '@/hooks/use-form-state';
import { useProfile } from '@/store/profile';

import { useToast } from '../feedback/Toast';
import { FormDialog } from '../ui/Dialog';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: role }));

/** Who is using this device. It is only a label, so there is nothing to sign in to. */
export function ProfileFormDialog({ onClose }: { onClose: () => void }) {
  const current = useProfile((state) => state.profile);
  const setProfile = useProfile((state) => state.setProfile);
  const toast = useToast();
  const { values, errors, setErrors, field } = useFormState<ProfileForm>(() => ({
    name: current?.name ?? '',
    role: current?.role ?? 'Receptionist',
  }));

  function submit() {
    const result = validateProfile(values);
    if (!result.ok) return setErrors(result.errors);
    setProfile(result.value);
    toast('Profile saved');
    onClose();
  }

  return (
    <FormDialog title="Your profile" okLabel="Save profile" onSubmit={submit} onClose={onClose} error={errors._form}>
      <TextField
        label="Your name"
        value={values.name}
        onChangeText={field('name')}
        error={errors.name}
        autoCapitalize="words"
        autoComplete="name"
      />
      <SelectField
        label="Role"
        value={values.role}
        options={ROLE_OPTIONS}
        onChange={(role) => field('role')(role as Role)}
        error={errors.role}
      />
    </FormDialog>
  );
}
