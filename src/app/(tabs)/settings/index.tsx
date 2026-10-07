import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback/Toast';
import { useModals } from '@/components/modals/ModalHost';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import { exportAllData } from '@/domain/clinic';
import { initials } from '@/domain/profile';
import { useActions, useData } from '@/store/hooks';
import { useProfile } from '@/store/profile';
import { useTheme } from '@/theme/theme';

export default function SettingsScreen() {
  const data = useData();
  const { erasePatientRecords, resetDemoData } = useActions();
  const profile = useProfile((state) => state.profile);
  const modals = useModals();
  const toast = useToast();
  const router = useRouter();
  const { colors } = useTheme();

  async function exportData() {
    try {
      await Clipboard.setStringAsync(exportAllData(data));
      toast('All data copied as text');
    } catch {
      toast('Copy failed');
    }
  }

  return (
    <Screen>
      <ScreenHeader moreBack title="Settings" subtitle="Your profile, appearance and privacy" />

      <Panel title="Profile">
        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.brand }]}>
            <AppText weight={800} size={20} color="onBrand">
              {profile ? initials(profile.name) : '?'}
            </AppText>
          </View>
          <View style={styles.profileText}>
            <AppText weight={700} size={17}>
              {profile?.name ?? 'Add your name'}
            </AppText>
            <AppText size={13} color="muted">
              {profile ? profile.role : 'So Kliniki can greet you. It stays on this device.'}
            </AppText>
          </View>
          <Button variant="ghost" size="sm" label={profile ? 'Edit' : 'Add'} onPress={modals.openProfile} />
        </View>
        <SettingsRow
          last
          icon="hospital-building"
          title="Clinic name"
          subtitle={data.clinic}
          onPress={modals.openClinic}
        />
      </Panel>

      <Panel title="Appearance">
        <View style={styles.appearance}>
          <AppText color="muted">Auto follows your device. Pick Light for the brightest view.</AppText>
          <ThemeSwitch />
        </View>
      </Panel>

      <Panel title="Privacy & data">
        <SettingsRow
          icon="shield-lock-outline"
          title="Privacy policy"
          subtitle="What Kliniki stores and where it is kept"
          onPress={() => router.push('/settings/privacy-policy')}
        />
        <SettingsRow
          icon="content-copy"
          title="Export all data"
          subtitle="Copy every record on this device as text, for a backup"
          onPress={exportData}
        />
        <SettingsRow
          danger
          icon="account-remove-outline"
          title="Delete patient records"
          subtitle="Removes all patients, visits, bills and claims. The pharmacy is kept."
          onPress={() =>
            modals.confirm({
              title: 'Delete all patient records?',
              message: `This permanently removes ${data.patients.length} patients, ${data.appointments.length} visits, ${data.bills.length} bills and ${data.claims.length} claims from this device. Export your data first if you may need it. This cannot be undone.`,
              confirmLabel: 'Delete everything',
              destructive: true,
              onConfirm: () => {
                erasePatientRecords();
                toast('Patient records deleted');
              },
            })
          }
        />
        <SettingsRow
          last
          danger
          icon="restore"
          title="Reset demo data"
          subtitle="Replaces everything on this device with the sample clinic"
          onPress={() =>
            modals.confirm({
              title: 'Reset demo data?',
              message: 'This replaces every patient, bill, claim and stock record on this device with the demo data.',
              confirmLabel: 'Replace all data',
              destructive: true,
              onConfirm: () => {
                resetDemoData();
                toast('Demo data restored');
              },
            })
          }
        />
      </Panel>

      <Panel title="About">
        <SettingsRow
          icon="file-document-outline"
          title="Terms of use"
          subtitle="The ground rules for using Kliniki"
          onPress={() => router.push('/settings/terms')}
        />
        <SettingsRow icon="information-outline" title="Version" subtitle={Constants.expoConfig?.version ?? '1.0.0'} />
        <SettingsRow
          last
          icon="cellphone-lock"
          title="Storage"
          subtitle="Saved on this device only. Syncing with a clinic server is not part of this build."
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1 },
  appearance: { gap: 12, padding: 16, maxWidth: 420 },
});
