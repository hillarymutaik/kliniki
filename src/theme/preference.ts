import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

interface ThemePreference {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** False until the saved choice has been read back (or reading failed). Never persisted. */
  ready: boolean;
}

export const useThemePreference = create<ThemePreference>()(
  persist(
    (set) => ({ mode: 'system', setMode: (mode) => set({ mode }), ready: false }),
    {
      name: 'kliniki_theme',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => {
        const mode = (persisted as { mode?: unknown } | undefined)?.mode;
        return THEME_MODES.includes(mode as ThemeMode) ? { ...current, mode: mode as ThemeMode } : current;
      },
      // Same reasoning as the data store: a failed read must still let the app start.
      onRehydrateStorage: () => () => useThemePreference.setState({ ready: true }),
    },
  ),
);
