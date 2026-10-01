import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled, accessibilityLabel, style }: ButtonProps) {
  const { colors } = useTheme();
  const small = size === 'sm';
  const fill = variant === 'primary' ? colors.brand : variant === 'danger' ? colors.red : 'transparent';

  return (
    <Pressable
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      // Small buttons are 30px tall; the extra hit area keeps them usable with a thumb.
      hitSlop={small ? 8 : 0}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.medium,
        {
          backgroundColor: fill,
          borderColor: variant === 'ghost' ? colors.line : fill,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <AppText weight={600} size={small ? 13 : 15} color={variant === 'ghost' ? 'ink' : 'onBrand'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select<ViewStyle>({ web: { cursor: 'pointer' } }),
  },
  medium: { paddingVertical: 10, paddingHorizontal: 16 },
  small: { paddingVertical: 5, paddingHorizontal: 10 },
});
