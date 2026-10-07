import { useState } from 'react';

import { useActions, useData } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { FormDialog } from '../ui/Dialog';
import { TextField } from '../ui/TextField';

/** Renames the clinic, which appears in the sidebar. */
export function ClinicFormDialog({ onClose }: { onClose: () => void }) {
  const { clinic } = useData();
  const { renameClinic } = useActions();
  const toast = useToast();
  const [name, setName] = useState(clinic);
  const [error, setError] = useState<string | undefined>();

  function submit() {
    const result = renameClinic(name);
    if (!result.ok) return setError(result.errors.name ?? result.errors._form);
    toast('Clinic name saved');
    onClose();
  }

  return (
    <FormDialog title="Clinic name" okLabel="Save" onSubmit={submit} onClose={onClose}>
      <TextField
        label="Clinic name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(undefined);
        }}
        error={error}
        autoCapitalize="words"
      />
    </FormDialog>
  );
}
