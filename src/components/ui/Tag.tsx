import { StyleSheet, View } from 'react-native';

import type { Palette } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';

export type Tone = 'green' | 'amber' | 'red' | 'blue';

const TONES: Record<Tone, { bg: keyof Palette; fg: keyof Palette }> = {
  green: { bg: 'brandSoft', fg: 'brandText' },
  amber: { bg: 'amberSoft', fg: 'amber' },
  red: { bg: 'redSoft', fg: 'red' },
  blue: { bg: 'blueSoft', fg: 'blue' },
};

export function Tag({ tone, children }: { tone: Tone; children: string }) {
  const { colors } = useTheme();
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors[bg] }]}>
      <AppText size={12} weight={600} color={fg} style={styles.text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
  text: { lineHeight: 18 },
});
