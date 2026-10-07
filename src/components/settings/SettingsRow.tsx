import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import type { Palette } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

import { AppText } from '../ui/AppText';
import { Icon, type IconName } from '../ui/Icon';

interface SettingsRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Makes the whole row tappable and adds a chevron (unless `right` is given). */
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
}

/** One line in a settings list: icon, title, optional explanation, and an action on the right. */
export function SettingsRow({ icon, title, subtitle, onPress, right, danger, last }: SettingsRowProps) {
  const { colors } = useTheme();
  const tone: keyof Palette = danger ? 'red' : 'ink';

  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: danger ? colors.redSoft : colors.brandSoft }]}>
        <Icon name={icon} size={20} color={danger ? 'red' : 'brandText'} />
      </View>
      <View style={styles.text}>
        <AppText weight={600} color={tone}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={13} color="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color="muted" /> : null)}
    </>
  );

  const border = { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : 1 };

  return onPress ? (
    <Pressable
      role="button"
      aria-label={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, border, pressed && { backgroundColor: colors.bg }, pointer]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, border]}>{content}</View>
  );
}

const pointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
});
