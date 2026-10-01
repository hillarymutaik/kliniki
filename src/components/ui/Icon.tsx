import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { Palette } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: keyof Palette;
}

/** Decorative by default: the label next to an icon carries the meaning for screen readers. */
export function Icon({ name, size = 20, color = 'ink' }: IconProps) {
  const { colors } = useTheme();
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={colors[color]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
