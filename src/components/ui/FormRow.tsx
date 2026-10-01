import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';

/** Two fields side by side on wide screens, stacked on narrow ones. */
export function FormRow({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();
  return <View style={[styles.row, isWide && styles.wide]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { gap: 0 },
  wide: { flexDirection: 'row', gap: 10, '& > *': undefined } as never,
});
