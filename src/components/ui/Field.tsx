import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type TextStyle } from 'react-native';

import type { Palette } from '@/theme/palette';
import { fontFamily } from '@/theme/fonts';

import { AppText } from './AppText';

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

/** Label above a control, with its validation message below. */
export function Field({ label, error, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <AppText size={13} weight={600} color="muted">
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText role="alert" accessibilityLiveRegion="polite" size={13} color="red">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Visual style shared by every text-like control so they all look like the prototype's inputs. */
export function inputStyle(colors: Palette, state: { focused?: boolean; invalid?: boolean; readOnly?: boolean }): TextStyle {
  return {
    fontFamily: fontFamily(400),
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: state.invalid ? colors.red : colors.line,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    width: '100%',
    opacity: state.readOnly ? 0.7 : 1,
    ...(state.focused && Platform.OS === 'web'
      ? { outlineStyle: 'solid', outlineWidth: 3, outlineColor: colors.blue, outlineOffset: 2 }
      : null),
  };
}

const styles = StyleSheet.create({
  field: { gap: 4, marginBottom: 12 },
});
