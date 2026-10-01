import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree';

export type Weight = 400 | 500 | 600 | 700 | 800;

// Android and the web build only pick up a custom font weight through a separate family per
// weight, so `fontWeight` is never used on text and every weight maps to its own family instead.
const FAMILY: Record<Weight, string> = {
  400: 'Figtree_400Regular',
  500: 'Figtree_500Medium',
  600: 'Figtree_600SemiBold',
  700: 'Figtree_700Bold',
  800: 'Figtree_800ExtraBold',
};

export const fontFamily = (weight: Weight = 400) => FAMILY[weight];

/** Passed to `useFonts` once at startup. */
export const fontAssets = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
};
