import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './palette';

export function useTheme(): { colors: Palette; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? darkPalette : lightPalette, dark };
}
