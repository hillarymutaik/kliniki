import { useWindowDimensions } from 'react-native';

/** At 820px and below the sidebar becomes a bottom bar, the same breakpoint the web prototype used. */
export const NARROW_MAX = 820;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width > NARROW_MAX;
  // Side padding of clamp(16px, 3vw, 40px)
  const gutter = Math.min(40, Math.max(16, Math.round(width * 0.03)));
  return { width, height, isWide, gutter };
}
