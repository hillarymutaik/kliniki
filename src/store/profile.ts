import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ROLES, validateProfile, type Profile } from '@/domain/profile';

interface ProfileState {
  /** Who is using this device. There are no accounts, so it is only a label; null until it is filled in. */
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  /** False until the saved profile has been read back (or reading failed). Never persisted. */
  ready: boolean;
}

export const PROFILE_KEY = 'kliniki_profile';

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({ profile: null, setProfile: (profile) => set({ profile }), ready: false }),
    {
      name: PROFILE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ profile: state.profile }),
      merge: (persisted, current) => {
        const saved = (persisted as { profile?: Profile | null } | undefined)?.profile;
        // Only trust a saved profile that passes the same checks as the form.
        const valid = saved && ROLES.includes(saved.role) && validateProfile(saved).ok;
        return valid ? { ...current, profile: saved } : current;
      },
      onRehydrateStorage: () => () => useProfile.setState({ ready: true }),
    },
  ),
);
