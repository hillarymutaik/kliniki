import type { DrugForm } from '@/domain/drugs';
import { useFormState } from '@/hooks/use-form-state';
import { useActions } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { DateField } from '../ui/DateField';
import { FormDialog } from '../ui/Dialog';
import { FormRow } from '../ui/FormRow';
import { TextField } from '../ui/TextField';

/** Adds a drug to the formulary together with its first batch. */
export function DrugFormDialog({ onClose }: { onClose: () => void }) {
  const { addDrug } = useActions();
  const toast = useToast();
  const { values, errors, setErrors, field } = useFormState<DrugForm>(() => ({
    name: '',
    unit: 'tabs',
    price: '',
    reorder: '50',
    batchNo: '',
    qty: '',
    exp: '',
  }));

  function submit() {
    const result = addDrug(values);
    if (!result.ok) return setErrors(result.errors);
    toast('Drug added');
    onClose();
  }

  return (
    <FormDialog title="Add drug" okLabel="Add drug" onSubmit={submit} onClose={onClose} error={errors._form}>
      <TextField
        label="Drug name & strength"
        value={values.name}
        onChangeText={field('name')}
        error={errors.name}
        placeholder="e.g. Ibuprofen 400mg tabs"
        autoCapitalize="sentences"
      />
      <FormRow>
        <TextField label="Unit" value={values.unit} onChangeText={field('unit')} error={errors.unit} autoCapitalize="none" />
        <TextField
          label="Selling price (KES)"
          value={values.price}
          onChangeText={field('price')}
          error={errors.price}
          keyboardType="number-pad"
          inputMode="numeric"
        />
      </FormRow>
      <FormRow>
        <TextField
          label="Reorder level"
          value={values.reorder}
          onChangeText={field('reorder')}
          error={errors.reorder}
          keyboardType="number-pad"
          inputMode="numeric"
        />
        <TextField
          label="Batch no."
          value={values.batchNo}
          onChangeText={field('batchNo')}
          error={errors.batchNo}
          autoCapitalize="characters"
        />
      </FormRow>
      <FormRow>
        <TextField
          label="Quantity received"
          value={values.qty}
          onChangeText={field('qty')}
          error={errors.qty}
          keyboardType="number-pad"
          inputMode="numeric"
        />
        <DateField label="Expiry date" value={values.exp} onChange={field('exp')} error={errors.exp} />
      </FormRow>
    </FormDialog>
  );
}
