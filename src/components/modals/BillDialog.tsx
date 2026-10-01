import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  addDrugLine,
  addServiceLine,
  billTotal,
  lineTotal,
  removeLine,
  setLineQty,
  type BillForm,
} from '@/domain/billing';
import { today } from '@/domain/dates';
import { kes } from '@/domain/money';
import { sellable } from '@/domain/stock';
import { PAY_METHODS, type PayMethod } from '@/domain/types';
import { useFormState } from '@/hooks/use-form-state';
import { useActions, useData } from '@/store/hooks';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

import { useToast } from '../feedback/Toast';
import { AppText } from '../ui/AppText';
import { FormDialog } from '../ui/Dialog';
import { FormRow } from '../ui/FormRow';
import { Icon } from '../ui/Icon';
import { SelectField, type SelectOption } from '../ui/SelectField';
import { Tag } from '../ui/Tag';
import { TextField } from '../ui/TextField';

const METHOD_OPTIONS = PAY_METHODS.map((method) => ({ value: method, label: method }));

/** Creates a bill for a patient: services and drugs, then how it was paid. */
export function BillDialog({ patientId, onClose }: { patientId?: string; onClose: () => void }) {
  const data = useData();
  const { createBill } = useActions();
  const toast = useToast();
  const { colors } = useTheme();
  const [todayDate] = useState(() => today());

  const { values, errors, setErrors, field } = useFormState<BillForm>(() => ({
    patientId: patientId ?? data.patients[0]?.id ?? '',
    lines: [],
    method: 'M-Pesa',
    ref: '',
  }));

  const patients = useMemo(
    () => data.patients.map((p) => ({ value: p.id, label: `${p.name} (${p.phone})` })),
    [data.patients],
  );

  const items = useMemo<SelectOption[]>(
    () => [
      ...data.services.map((s) => ({ value: `s:${s.id}`, label: `${s.name} — ${kes(s.price)}`, group: 'Services' })),
      ...data.drugs.map((d) => {
        const left = sellable(d, todayDate);
        return {
          value: `d:${d.id}`,
          label: `${d.name} — ${kes(d.price)}`,
          detail: `${left} ${d.unit} left`,
          disabled: left === 0,
          group: 'Drugs',
        };
      }),
    ],
    [data.services, data.drugs, todayDate],
  );

  const patient = data.patients.find((p) => p.id === values.patientId);
  const setLines = field('lines');

  function addItem(value: string) {
    const id = value.slice(2);
    if (value.startsWith('s:')) {
      const service = data.services.find((s) => s.id === id);
      if (service) setLines(addServiceLine(values.lines, service));
    } else {
      const drug = data.drugs.find((d) => d.id === id);
      if (drug) setLines(addDrugLine(values.lines, drug));
    }
  }

  function submit() {
    const result = createBill(values);
    if (!result.ok) return setErrors(result.errors);
    const { bill, claim } = result.value;
    toast(claim ? `${bill.no} saved, SHA claim drafted` : `${bill.no} saved: ${kes(bill.total)}`);
    onClose();
  }

  return (
    <FormDialog title="New bill" okLabel="Save bill" onSubmit={submit} onClose={onClose} error={errors._form}>
      <SelectField
        label="Patient"
        value={values.patientId}
        options={patients}
        onChange={field('patientId')}
        error={errors.patientId}
      />
      {patient?.allergies ? (
        <View style={styles.allergy}>
          <Tag tone="red">{`Allergy: ${patient.allergies}`}</Tag>
        </View>
      ) : null}

      <SelectField label="Items" value="" options={items} onChange={addItem} placeholder="Add service or drug…" />

      {values.lines.length > 0 ? (
        <View style={styles.lines}>
          {values.lines.map((line, index) => (
            <View key={line.drugId ?? `service-${index}`} style={styles.line}>
              <AppText numberOfLines={2} style={styles.lineName}>
                {line.name}
              </AppText>
              <QtyInput
                label={`Quantity of ${line.name}`}
                value={line.qty}
                onChange={(qty) => setLines(setLineQty(values.lines, index, qty))}
              />
              <AppText style={styles.lineTotal}>{kes(lineTotal(line))}</AppText>
              <Pressable
                role="button"
                aria-label={`Remove ${line.name}`}
                hitSlop={8}
                onPress={() => setLines(removeLine(values.lines, index))}
              >
                <Icon name="close" size={20} color="muted" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {errors.lines ? (
        <AppText role="alert" accessibilityLiveRegion="polite" size={13} color="red" style={styles.linesError}>
          {errors.lines}
        </AppText>
      ) : null}
      <AppText weight={800} size={20} style={[styles.total, { color: colors.ink }]}>
        {kes(billTotal(values.lines))}
      </AppText>

      <FormRow>
        <SelectField
          label="Payment method"
          value={values.method}
          options={METHOD_OPTIONS}
          onChange={(method) => field('method')(method as PayMethod)}
          error={errors.method}
        />
        {values.method === 'M-Pesa' ? (
          <TextField
            label="M-Pesa code"
            value={values.ref}
            onChangeText={(text) => field('ref')(text.toUpperCase())}
            error={errors.ref}
            placeholder="e.g. SIJ4K2LQ8P"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
          />
        ) : null}
      </FormRow>
    </FormDialog>
  );
}

/**
 * Whole-number quantity box. While it has focus it shows exactly what was typed (so it can be empty
 * mid-edit); the bill itself always holds a valid number of at least 1.
 */
function QtyInput({ label, value, onChange }: { label: string; value: number; onChange: (qty: number) => void }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState('');

  return (
    <TextInput
      accessibilityLabel={label}
      value={focused ? typed : String(value)}
      keyboardType="number-pad"
      inputMode="numeric"
      selectTextOnFocus
      maxLength={4}
      onFocus={() => {
        setTyped(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, '');
        setTyped(digits);
        onChange(parseInt(digits, 10) || 1);
      }}
      style={[styles.qty, { color: colors.ink, backgroundColor: colors.bg, borderColor: colors.line }]}
    />
  );
}

const styles = StyleSheet.create({
  allergy: { marginBottom: 10 },
  lines: { marginBottom: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  lineName: { flex: 1 },
  lineTotal: { minWidth: 84, textAlign: 'right' },
  linesError: { marginBottom: 4 },
  total: { textAlign: 'right', marginTop: 8, marginBottom: 12 },
  qty: {
    width: 64,
    fontFamily: fontFamily(400),
    fontSize: 15,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
});
