import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';

/** Says what is missing and what to do about it. */
export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.box}>
      <AppText color="muted" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center' },
  text: { textAlign: 'center' },
});
