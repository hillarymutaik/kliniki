import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export function CheckboxField({ label, checked, onChange, error }: CheckboxFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: error ? colors.red : checked ? colors.brand : colors.muted,
              backgroundColor: checked ? colors.brand : 'transparent',
            },
          ]}
        >
          {checked ? <Icon name="check" size={16} color="onBrand" /> : null}
        </View>
        <AppText size={13} style={styles.label}>
          {label}
        </AppText>
      </Pressable>
      {error ? (
        <AppText role="alert" accessibilityLiveRegion="polite" size={13} color="red">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 32,
    ...Platform.select<ViewStyle>({ web: { cursor: 'pointer' } }),
  },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
