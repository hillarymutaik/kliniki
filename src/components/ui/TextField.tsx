import { useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/theme';

import { useSubmitOnEnter } from './Dialog';
import { Field, inputStyle } from './Field';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  readOnly?: boolean;
}

export function TextField({ label, value, onChangeText, error, readOnly, onSubmitEditing, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const submit = useSubmitOnEnter();

  return (
    <Field label={label} error={error}>
      <TextInput
        {...input}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={label}
        aria-invalid={!!error}
        editable={!readOnly}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Enter submits the form on the web, as it does in an HTML form. Native keyboards just dismiss.
        onSubmitEditing={onSubmitEditing ?? (Platform.OS === 'web' && submit ? () => submit() : undefined)}
        style={inputStyle(colors, { focused, invalid: !!error, readOnly })}
      />
    </Field>
  );
}
