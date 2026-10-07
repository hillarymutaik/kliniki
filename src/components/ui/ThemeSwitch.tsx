import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { THEME_MODES, useThemePreference, type ThemeMode } from '@/theme/preference';
import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const OPTIONS: Record<ThemeMode, { label: string; icon: IconName }> = {
  system: { label: 'Auto', icon: 'theme-light-dark' },
  light: { label: 'Light', icon: 'weather-sunny' },
  dark: { label: 'Dark', icon: 'weather-night' },
};

/** Segmented control for the colour theme. `onDark` styles it for the sidebar, which is dark in both themes. */
export function ThemeSwitch({ onDark = false }: { onDark?: boolean }) {
  const { colors } = useTheme();
  const mode = useThemePreference((state) => state.mode);
  const setMode = useThemePreference((state) => state.setMode);

  const track = onDark ? 'rgba(255,255,255,0.08)' : colors.bg;
  const idleText = onDark ? 'sideInk' : 'muted';

  return (
    <View role="radiogroup" aria-label="Colour theme" style={[styles.track, { backgroundColor: track, borderColor: onDark ? 'rgba(255,255,255,0.12)' : colors.line }]}>
      {THEME_MODES.map((value) => {
        const selected = value === mode;
        const { label, icon } = OPTIONS[value];
        return (
          <Pressable
            key={value}
            role="radio"
            aria-checked={selected}
            aria-label={`${label} theme`}
            onPress={() => setMode(value)}
            style={[styles.segment, { backgroundColor: selected ? colors.brand : 'transparent' }]}
          >
            <Icon name={icon} size={16} color={selected ? 'onBrand' : idleText} />
            <AppText size={13} weight={600} color={selected ? 'onBrand' : idleText}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 2 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 6,
    borderRadius: 8,
    ...Platform.select<ViewStyle>({ web: { cursor: 'pointer' } }),
  },
});
