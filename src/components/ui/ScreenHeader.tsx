import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Buttons shown at the right, wrapping under the title on narrow screens. */
  actions?: ReactNode;
  /** A link above the title that leads back up, e.g. Patients above a patient's name. */
  back?: { label: string; href: Href };
}

export function ScreenHeader({ title, subtitle, actions, back }: ScreenHeaderProps) {
  return (
    <View style={styles.head}>
      <View style={styles.titles}>
        {back ? (
          <Link href={back.href} role="link" accessibilityLabel={`Back to ${back.label}`}>
            <AppText color="muted">{back.label}</AppText>
          </Link>
        ) : null}
        <AppText role="heading" aria-level={1} weight={800} size={28} style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText color="muted" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  titles: { flexShrink: 1 },
  title: { letterSpacing: -0.56, lineHeight: 34 },
  subtitle: { marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
