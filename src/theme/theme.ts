import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './palette';
import { useThemePreference } from './preference';

/** The palette in use: the person's own choice, or the device's light/dark setting when it is "system". */
export function useTheme(): { colors: Palette; dark: boolean } {
  const system = useColorScheme();
  const mode = useThemePreference((state) => state.mode);
  const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
  return { colors: dark ? darkPalette : lightPalette, dark };
}
