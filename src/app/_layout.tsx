import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { ToastProvider } from '@/components/feedback/Toast';
import { ModalHost } from '@/components/modals/ModalHost';
import { useHydrated } from '@/store/hooks';
import { fontAssets } from '@/theme/fonts';
import { useProfile } from '@/store/profile';
import { useThemePreference } from '@/theme/preference';
import { useTheme } from '@/theme/theme';

// Keep the splash screen up until the fonts are loaded and the saved data, theme choice and profile have been
// read back, so the first frame is the real app rather than a flash of default fonts or the wrong theme.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colors, dark } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const dataReady = useHydrated();
  const themeReady = useThemePreference((state) => state.ready);
  const profileReady = useProfile((state) => state.ready);
  // A font that fails to load falls back to the system font; it must not leave the app blank.
  const ready = (fontsLoaded || !!fontError) && dataReady && themeReady && profileReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: colors.bg, card: colors.surface, text: colors.ink, border: colors.line, primary: colors.brand },
    };
  }, [dark, colors]);

  useEffect(() => {
    // Behind the app on the web, so overscroll and resizing never flash white.
    if (typeof document !== 'undefined') document.documentElement.style.backgroundColor = colors.bg;
  }, [colors.bg]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <ToastProvider>
        <ModalHost>
          {/* Light icons over the dark theme and the other way round, following the in-app choice. */}
          <StatusBar style={dark ? 'light' : 'dark'} />
          {/* The (tabs) group with the app shell, or the not-found page for unknown URLs. */}
          <Slot />
        </ModalHost>
      </ToastProvider>
    </ThemeProvider>
  );
}
