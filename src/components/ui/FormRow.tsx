import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLayout } from '@/hooks/use-layout';

/** Fields side by side in equal columns on wide screens, stacked on narrow ones. */
export function FormRow({ children }: { children: ReactNode }) {
  const { isWide } = useLayout();
  if (!isWide) return <>{children}</>;
  return (
    <View style={styles.row}>
      {Children.map(children, (child) => (
        <View style={styles.cell}>{child}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
});
