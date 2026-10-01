import type { CSSProperties } from 'react';

import type { Palette } from '@/theme/palette';

/** The same look as `inputStyle`, as CSS, for the plain <input> elements the web build uses for dates and times. */
export function webInputStyle(
  colors: Palette,
  dark: boolean,
  state: { invalid?: boolean; readOnly?: boolean },
): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: '100%',
    font: '15px Figtree_400Regular, system-ui, sans-serif',
    color: colors.ink,
    backgroundColor: colors.bg,
    border: `1px solid ${state.invalid ? colors.red : colors.line}`,
    borderRadius: 8,
    padding: '9px 11px',
    opacity: state.readOnly ? 0.7 : 1,
    // Makes the calendar popup and its icon follow the app theme.
    colorScheme: dark ? 'dark' : 'light',
  };
}
