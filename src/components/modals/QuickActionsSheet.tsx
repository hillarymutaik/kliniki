import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';

import { ActionTile, TileGrid } from '../ui/ActionTile';
import { AppText } from '../ui/AppText';
import type { ModalApi } from './ModalHost';

/** The centre button's menu: the things staff do most often, one tap from anywhere. */
export function QuickActionsSheet({ api, onClose }: { api: ModalApi; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        {/* Fills the space above the sheet, so a tap outside dismisses it. */}
        <Pressable focusable={false} aria-hidden style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          role="dialog"
          aria-modal
          aria-label="Quick actions"
          style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: 24 + insets.bottom }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <AppText role="heading" aria-level={2} weight={700} size={18} style={styles.title}>
            Quick actions
          </AppText>
          <TileGrid>
            <ActionTile icon="account-clock-outline" label="Add walk-in" onPress={() => api.openAppointmentForm({ walkIn: true })} />
            <ActionTile icon="receipt-text-outline" label="New bill" onPress={() => api.openBill()} />
            <ActionTile icon="account-plus-outline" label="Register patient" onPress={() => api.openPatientForm()} />
            <ActionTile icon="calendar-plus" label="Book appointment" onPress={() => api.openAppointmentForm()} />
            <ActionTile icon="pill" label="Add drug" onPress={() => api.openDrugForm()} />
          </TileGrid>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 14 },
  title: { textAlign: 'center', marginBottom: 16 },
});
