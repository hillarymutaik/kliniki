import { useTheme } from '@/theme/theme';

import { Field } from './Field';
import { webInputStyle } from './web-input';

interface TimeFieldProps {
  label: string;
  /** HH:MM, or empty while the browser's picker is incomplete. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function TimeField({ label, value, onChange, error }: TimeFieldProps) {
  const { colors, dark } = useTheme();
  return (
    <Field label={label} error={error}>
      <input
        type="time"
        value={value}
        aria-label={label}
        aria-invalid={!!error}
        onChange={(event) => onChange(event.target.value)}
        style={webInputStyle(colors, dark, { invalid: !!error })}
      />
    </Field>
  );
}
