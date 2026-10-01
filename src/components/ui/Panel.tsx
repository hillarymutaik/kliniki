import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';

interface PanelProps {
  title?: string;
  /** Sits at the right of the title row. */
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Panel({ title, right, children, style }: PanelProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>
      {title ? (
        <View style={[styles.header, { borderBottomColor: colors.line }]}>
          <AppText role="heading" aria-level={2} weight={700} size={16}>
            {title}
          </AppText>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 10, marginBottom: 20, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
});
