import { StyleSheet } from 'react-native';

import { AppText } from './AppText';

/** Small capitalised heading that introduces a group of cards. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <AppText role="heading" aria-level={2} size={14} weight={600} color="muted" style={styles.label}>
      {children.toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 1.1, marginTop: 28, marginBottom: 12 },
});
