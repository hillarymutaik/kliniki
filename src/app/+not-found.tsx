import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/theme/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.bg }]}>
      <AppText role="heading" aria-level={1} weight={800} size={24}>
        Page not found
      </AppText>
      <AppText color="muted">That page does not exist in Kliniki.</AppText>
      <Link href="/" role="link">
        <AppText color="brandText" weight={600}>
          Go to Today
        </AppText>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
});
