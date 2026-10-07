import { StyleSheet, View } from 'react-native';

import type { LegalDocument } from '@/content/legal';

import { AppText } from '../ui/AppText';
import { Panel } from '../ui/Panel';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';

export function LegalScreen({ doc }: { doc: LegalDocument }) {
  return (
    <Screen>
      <ScreenHeader title={doc.title} subtitle={doc.subtitle} back={{ label: 'Settings', href: '/settings' }} />
      <Panel>
        <View style={styles.body}>
          <AppText size={13} color="muted">{`Last updated ${doc.updated}`}</AppText>
          {doc.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <AppText role="heading" aria-level={2} weight={700} size={17}>
                {section.heading}
              </AppText>
              {section.paragraphs.map((text) => (
                <AppText key={text} style={styles.paragraph}>
                  {text}
                </AppText>
              ))}
            </View>
          ))}
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 18, maxWidth: 760 },
  section: { gap: 6 },
  paragraph: { lineHeight: 24 },
});
