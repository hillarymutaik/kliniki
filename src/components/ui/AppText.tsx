import { Text, type TextProps } from 'react-native';

import type { Palette } from '@/theme/palette';
import { fontFamily, type Weight } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

export interface AppTextProps extends TextProps {
  weight?: Weight;
  size?: number;
  color?: keyof Palette;
}

/** All text in the app goes through here so it always gets the brand font, theme colour and 1.5 line height. */
export function AppText({ weight = 400, size = 15, color = 'ink', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fontFamily(weight), fontSize: size, lineHeight: Math.round(size * 1.5), color: colors[color] }, style]}
    />
  );
}
