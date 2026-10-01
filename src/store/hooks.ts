import { useKlinikiStore } from './store';

// Select raw slices only. A selector that builds a new array or object on every call makes
// Zustand 5 re-render forever under React 19, so derived lists are computed with useMemo instead.
export const useData = () => useKlinikiStore((state) => state.data);
export const useActions = () => useKlinikiStore((state) => state.actions);

/** True once saved data has been read back (or reading it failed and the demo data is in use). */
export const useHydrated = () => useKlinikiStore((state) => state.ready);
