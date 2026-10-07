import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme';

/** Settings and its legal pages stack, so Android's back button and the browser's back return to Settings. */
export default function SettingsLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
