import { useTheme } from '@/theme/theme';

import { Field } from './Field';
import { webInputStyle } from './web-input';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, or empty while the browser's picker is incomplete. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
}

/** The browser's own date picker: it already speaks YYYY-MM-DD, and it works with keyboard and screen readers. */
export function DateField({ label, value, onChange, error, readOnly }: DateFieldProps) {
  const { colors, dark } = useTheme();
  return (
    <Field label={label} error={error}>
      <input
        type="date"
        value={value}
        aria-label={label}
        aria-invalid={!!error}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        style={webInputStyle(colors, dark, { invalid: !!error, readOnly })}
      />
    </Field>
  );
}
