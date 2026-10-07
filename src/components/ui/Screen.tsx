import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/theme/theme';

/** Scrolling page body with the prototype's 1200px column and responsive side padding. */
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { isWide, gutter } = useLayout();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={[
        styles.content,
        {
          // The sidebar fills the full height on wide screens, so only narrow ones need to clear the status bar.
          paddingTop: isWide ? 28 : insets.top + 20,
          // On a phone the floating tab bar sits over the bottom of the page, so leave room beneath the last card.
          paddingBottom: isWide ? 32 + insets.bottom : 124 + insets.bottom,
          paddingLeft: gutter,
          paddingRight: gutter + (isWide ? insets.right : 0),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: '100%', maxWidth: 1200 },
});
