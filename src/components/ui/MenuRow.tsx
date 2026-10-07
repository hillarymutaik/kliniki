import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface MenuRowProps {
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** A full-width rounded card that leads to another page. */
export function MenuRow({ icon, label, onPress }: MenuRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="link"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.bg : colors.surface, borderColor: colors.line },
        pointer,
      ]}
    >
      <View style={styles.icon}>
        <Icon name={icon} size={28} color="brandText" />
      </View>
      <AppText size={17} style={styles.label}>
        {label}
      </AppText>
      <Icon name="chevron-right" size={24} color="muted" />
    </Pressable>
  );
}

const pointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: { width: 36, alignItems: 'center' },
  label: { flex: 1 },
});
