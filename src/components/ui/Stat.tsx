import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Palette } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';

interface StatProps {
  value: string | number;
  label: string;
  /** Draws attention to the number, e.g. amber for low stock. */
  valueColor?: keyof Palette;
}

export function Stat({ value, label, valueColor = 'ink' }: StatProps) {
  const { colors, dark } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[
        styles.stat,
        { backgroundColor: colors.surface, borderColor: colors.line },
        dark ? null : { boxShadow: '0 1px 3px rgba(18, 38, 58, 0.08)' },
      ]}
    >
      <AppText weight={700} size={24} color={valueColor} style={styles.value}>
        {value}
      </AppText>
      <AppText size={13} color="muted">
        {label}
      </AppText>
    </View>
  );
}

/** Stats flow into as many columns as fit, two on a phone. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 },
  stat: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  value: { letterSpacing: -0.5, lineHeight: 32 },
});
