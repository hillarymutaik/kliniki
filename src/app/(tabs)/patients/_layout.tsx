import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme';

/** The list and a patient's page stack, so Android's back button and the browser's back return to the list. */
export default function PatientsLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
