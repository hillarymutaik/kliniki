import { useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

interface SearchInputProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

export function SearchInput({ value, onChangeText, placeholder }: SearchInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      role="searchbox"
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.input,
        { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line },
        focused && Platform.OS === 'web'
          ? { outlineStyle: 'solid', outlineWidth: 3, outlineColor: colors.blue, outlineOffset: 2 }
          : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fontFamily(400),
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
});
