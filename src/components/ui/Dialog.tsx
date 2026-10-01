import { createContext, useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme/theme';

import { AppText } from './AppText';
import { Button } from './Button';

/** Lets text inputs submit their dialog when Enter is pressed (web). */
const SubmitContext = createContext<(() => void) | null>(null);
export const useSubmitOnEnter = () => useContext(SubmitContext);

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Centred card over a dimmed backdrop. Tapping the backdrop does not close it, so a stray tap
 * can't throw away a half-filled bill; Cancel, Escape and the Android back button do.
 */
export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.overlay }]}
      >
        <View
          role="dialog"
          aria-modal
          aria-label={title}
          accessibilityViewIsModal
          style={[styles.card, { width: Math.min(560, width * 0.94), backgroundColor: colors.surface }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <AppText role="heading" aria-level={2} weight={700} size={17}>
              {title}
            </AppText>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.line }]}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FormDialogProps {
  title: string;
  okLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  /** A problem that belongs to the whole form rather than one field. */
  error?: string;
  children: ReactNode;
}

export function FormDialog({ title, okLabel, onSubmit, onClose, error, children }: FormDialogProps) {
  return (
    <SubmitContext.Provider value={onSubmit}>
      <Dialog
        title={title}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" label="Cancel" onPress={onClose} />
            <Button label={okLabel} onPress={onSubmit} />
          </>
        }
      >
        {children}
        {error ? (
          <AppText role="alert" color="red" size={13}>
            {error}
          </AppText>
        ) : null}
      </Dialog>
    </SubmitContext.Provider>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** In-app replacement for window.confirm, which does not exist on native and is a no-op in React Native's Alert on web. */
export function ConfirmDialog({ title, message, confirmLabel, destructive, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" label="Cancel" onPress={onClose} />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={() => {
              onClose();
              onConfirm();
            }}
          />
        </>
      }
    >
      <AppText>{message}</AppText>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { maxHeight: '90%', borderRadius: 12, overflow: 'hidden' },
  header: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1 },
  body: { flexShrink: 1 },
  bodyContent: { paddingVertical: 18, paddingHorizontal: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
});
