import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface ActionTileProps {
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** A rounded card with an outlined icon beside its label, laid out two to a row. */
export function ActionTile({ icon, label, onPress }: ActionTileProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? colors.bg : colors.surface, borderColor: colors.line },
        pointer,
      ]}
    >
      <Icon name={icon} size={34} color="brandText" />
      <AppText weight={600} size={16} style={styles.label} numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Tiles wrap two to a row. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const pointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: { flex: 1, lineHeight: 21 },
});
