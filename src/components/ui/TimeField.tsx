import { maskTime } from './masks';
import { TextField } from './TextField';

interface TimeFieldProps {
  label: string;
  /** HH:MM, or partly typed. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** Native: a number pad that inserts the colon. The web build swaps this for the browser's own time picker. */
export function TimeField({ label, value, onChange, error }: TimeFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) => onChange(maskTime(text))}
      error={error}
      placeholder="HH:MM"
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={5}
    />
  );
}
