import type { StockForm } from '@/domain/drugs';
import { useFormState } from '@/hooks/use-form-state';
import { useActions, useData } from '@/store/hooks';

import { useToast } from '../feedback/Toast';
import { DateField } from '../ui/DateField';
import { FormDialog } from '../ui/Dialog';
import { FormRow } from '../ui/FormRow';
import { TextField } from '../ui/TextField';

/** Receives a new batch of an existing drug. */
export function RestockDialog({ drugId, onClose }: { drugId: string; onClose: () => void }) {
  const data = useData();
  const { receiveStock } = useActions();
  const toast = useToast();
  const drug = data.drugs.find((d) => d.id === drugId);
  const { values, errors, setErrors, field } = useFormState<StockForm>(() => ({ batchNo: '', qty: '', exp: '' }));

  function submit() {
    const result = receiveStock(drugId, values);
    if (!result.ok) return setErrors(result.errors);
    toast(`${result.value.batch.qty} ${result.value.drug.unit} received`);
    onClose();
  }

  return (
    <FormDialog
      title={`Receive stock: ${drug?.name ?? 'unknown drug'}`}
      okLabel="Receive stock"
      onSubmit={submit}
      onClose={onClose}
      error={errors._form}
    >
      <FormRow>
        <TextField
          label="Batch no."
          value={values.batchNo}
          onChangeText={field('batchNo')}
          error={errors.batchNo}
          autoCapitalize="characters"
        />
        <TextField
          label={`Quantity (${drug?.unit ?? 'units'})`}
          value={values.qty}
          onChangeText={field('qty')}
          error={errors.qty}
          keyboardType="number-pad"
          inputMode="numeric"
        />
      </FormRow>
      <DateField label="Expiry date" value={values.exp} onChange={field('exp')} error={errors.exp} />
    </FormDialog>
  );
}
