import { maskDate } from './masks';
import { TextField } from './TextField';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, or partly typed. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
}

/** Native: a number pad that inserts the dashes. The web build swaps this for the browser's own date picker. */
export function DateField({ label, value, onChange, error, readOnly }: DateFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) => onChange(maskDate(text))}
      error={error}
      readOnly={readOnly}
      placeholder="YYYY-MM-DD"
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={10}
    />
  );
}
