import * as Clipboard from 'expo-clipboard';
import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback/Toast';
import { useModals } from '@/components/modals/ModalHost';
import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MenuRow } from '@/components/ui/MenuRow';
import { Screen } from '@/components/ui/Screen';
import { exportAllData } from '@/domain/clinic';
import { initials } from '@/domain/profile';
import { dashboardStats } from '@/domain/stats';
import { useLayout } from '@/hooks/use-layout';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';
import { useProfile } from '@/store/profile';
import { useTheme } from '@/theme/theme';

/** Phone only: the profile and everything that does not have a tab of its own. */
export default function MoreScreen() {
  const { isWide } = useLayout();
  const data = useData();
  const profile = useProfile((state) => state.profile);
  const modals = useModals();
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const { colors } = useTheme();
  const stats = useMemo(() => dashboardStats(data, today), [data, today]);

  // The sidebar already lists everything on wide screens.
  if (isWide) return <Redirect href="/" />;

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
      <AppText role="heading" aria-level={1} weight={800} size={28} style={styles.title}>
        More
      </AppText>

      <Pressable
        role="button"
        aria-label={profile ? `${profile.name}, ${profile.role}. Edit profile` : 'Add your name'}
        onPress={modals.openProfile}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
      >
        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.brand }]}>
            <AppText weight={800} size={26} color="onBrand">
              {profile ? initials(profile.name) : '?'}
            </AppText>
          </View>
          <View style={styles.profileText}>
            <AppText weight={700} size={20}>
              {profile?.name ?? 'Add your name'}
            </AppText>
            <AppText color="muted">{profile ? profile.role : 'Tap to set up your profile'}</AppText>
          </View>
          <Icon name="chevron-right" size={24} color="muted" />
        </View>
        <View style={[styles.facts, { borderTopColor: colors.line }]}>
          <Fact label="Clinic" value={data.clinic} wide />
          <Divider />
          <Fact label="In queue" value={String(stats.inQueue)} />
          <Divider />
          <Fact label="Claims" value={String(stats.pendingClaims.count)} />
        </View>
      </Pressable>

      <View style={[styles.card, styles.quick, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <AppText weight={600} size={17} color="muted" style={[styles.quickTitle, { borderBottomColor: colors.line }]}>
          Quick actions
        </AppText>
        <View style={styles.quickRow}>
          <QuickAction icon="account-clock-outline" label="Walk-in" onPress={() => modals.openAppointmentForm({ walkIn: true })} />
          <QuickAction icon="receipt-text-outline" label="New bill" onPress={() => modals.openBill()} />
          <QuickAction icon="content-copy" label="Export data" onPress={exportData} />
        </View>
      </View>

      <View style={styles.rows}>
        <MenuRow icon="calendar-month-outline" label="Appointments" onPress={() => router.push('/appointments')} />
        <MenuRow icon="receipt-text-outline" label="Billing" onPress={() => router.push('/billing')} />
        <MenuRow icon="shield-check-outline" label="SHA claims" onPress={() => router.push('/claims')} />
        <MenuRow icon="chart-bar" label="Reports" onPress={() => router.push('/reports')} />
        <MenuRow icon="cog-outline" label="Settings" onPress={() => router.push('/settings')} />
      </View>
    </Screen>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.fact, wide && styles.factWide]}>
      <AppText size={14} color="muted">
        {label}
      </AppText>
      <AppText weight={700} size={16} numberOfLines={wide ? 2 : 1} style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} style={styles.quickAction}>
      <Icon name={icon} size={36} color="brandText" />
      <AppText weight={600} size={15} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { letterSpacing: -0.5, marginBottom: 18 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1 },
  facts: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: 8 },
  fact: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  factWide: { flex: 1.8 },
  factValue: { textAlign: 'center' },
  divider: { width: 1, height: 36 },
  quick: { marginBottom: 20 },
  quickTitle: { textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  quickRow: { flexDirection: 'row', paddingVertical: 18 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8 },
  rows: { gap: 12 },
});
