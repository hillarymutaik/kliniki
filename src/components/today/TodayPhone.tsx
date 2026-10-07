import { useRouter, type Href } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { QueueAction } from '@/components/shared/QueueAction';
import { useModals } from '@/components/modals/ModalHost';
import { ActionTile, TileGrid } from '@/components/ui/ActionTile';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { clockTime, formatLongDate } from '@/domain/dates';
import { kes } from '@/domain/money';
import { findPatient } from '@/domain/patients';
import { greeting } from '@/domain/profile';
import type { Appointment } from '@/domain/types';
import { useLayout } from '@/hooks/use-layout';
import { useTodayData } from '@/hooks/use-today-data';
import { useProfile } from '@/store/profile';
import type { Palette } from '@/theme/palette';
import { useTheme } from '@/theme/theme';

const SHORTCUTS: { icon: IconName; label: string; short: string; href: Href }[] = [
  { icon: 'calendar-month-outline', label: 'Appointments', short: 'Appts', href: '/appointments' },
  { icon: 'receipt-text-outline', label: 'Billing', short: 'Billing', href: '/billing' },
  { icon: 'shield-check-outline', label: 'SHA claims', short: 'Claims', href: '/claims' },
  { icon: 'chart-bar', label: 'Reports', short: 'Reports', href: '/reports' },
];

/** Home on a phone: a greeting, round shortcuts, big tiles, then the day's figures and queue. */
export function TodayPhone() {
  const { colors } = useTheme();
  const { width } = useLayout();
  const router = useRouter();
  const modals = useModals();
  const profile = useProfile((state) => state.profile);
  const { data, today, stats, queue } = useTodayData();

  const name = profile ? profile.name.split(' ')[0] : data.clinic;

  return (
    <Screen>
      <View style={styles.hero}>
        <AppText size={18}>{greeting(clockTime())}</AppText>
        {/* A first name fits at full size; a clinic name wraps onto two lines at a smaller one. */}
        <AppText
          role="heading"
          aria-level={1}
          weight={800}
          size={name.length <= 12 ? 36 : 28}
          style={[styles.name, { textAlign: 'center' }]}
          numberOfLines={2}
        >
          {name.toUpperCase()}
        </AppText>
        <AppText size={14} color="muted">
          {formatLongDate(today)}
        </AppText>
      </View>

      <Pressable
        role="link"
        aria-label={`Collected today ${kes(stats.collectedToday)}. Open reports`}
        onPress={() => router.push('/reports')}
        style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.line }, pointer]}
      >
        <AppText size={14} color="muted">
          Collected today
        </AppText>
        <AppText weight={800} size={20} color="brandText">
          {kes(stats.collectedToday)}
        </AppText>
      </Pressable>

      <View style={styles.circles}>
        {SHORTCUTS.map((item) => (
          <Pressable
            key={item.label}
            role="link"
            aria-label={item.label}
            onPress={() => router.push(item.href)}
            style={[styles.circleWrap, pointer]}
          >
            <View style={[styles.circle, { borderColor: colors.brand, backgroundColor: colors.surface }]}>
              <Icon name={item.icon} size={32} color="brandText" />
            </View>
            <AppText size={13} numberOfLines={1} style={styles.circleLabel}>
              {width < 360 ? item.short : item.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <TileGrid>
        <ActionTile icon="account-clock-outline" label="Add walk-in" onPress={() => modals.openAppointmentForm({ walkIn: true })} />
        <ActionTile icon="receipt-text-outline" label="New bill" onPress={() => modals.openBill()} />
        <ActionTile icon="account-plus-outline" label="Register patient" onPress={() => modals.openPatientForm()} />
        <ActionTile icon="pill" label="Add drug" onPress={() => modals.openDrugForm()} />
      </TileGrid>

      <SectionLabel>Today at a glance</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glance} style={styles.glanceScroll}>
        <GlanceCard solid value={stats.inQueue} label="Waiting or in consult" />
        <GlanceCard tone="amber" value={stats.lowStock} label="Drugs at reorder level" />
        <GlanceCard tone="red" value={stats.expiring} label="Expiring within 60 days" />
        <GlanceCard tone="blue" value={kes(stats.pendingClaims.amount)} label={`${stats.pendingClaims.count} SHA claims pending`} />
      </ScrollView>

      <SectionLabel>Queue</SectionLabel>
      {queue.length > 0 ? (
        <View style={styles.queue}>
          {queue.map((appointment) => (
            <QueueCard
              key={appointment.id}
              appointment={appointment}
              name={findPatient(data, appointment.patientId)?.name ?? 'Unknown'}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <EmptyState message="No patients booked today. Add a walk-in to start the queue." />
        </View>
      )}
    </Screen>
  );
}

type Tone = 'amber' | 'red' | 'blue';
const TONES: Record<Tone, { bg: keyof Palette; fg: keyof Palette }> = {
  amber: { bg: 'amberSoft', fg: 'amber' },
  red: { bg: 'redSoft', fg: 'red' },
  blue: { bg: 'blueSoft', fg: 'blue' },
};

/** One figure on a coloured card. The first is solid brand green; the others take the colour of what they warn about. */
function GlanceCard({ value, label, solid, tone }: { value: string | number; label: string; solid?: boolean; tone?: Tone }) {
  const { colors } = useTheme();
  const fill = solid ? colors.brand : colors[TONES[tone ?? 'blue'].bg];
  const text: keyof Palette = solid ? 'onBrand' : TONES[tone ?? 'blue'].fg;

  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.glanceCard, { backgroundColor: fill }]}>
      <AppText weight={800} size={30} color={text} style={styles.glanceValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText weight={600} size={14} color={text}>
        {label}
      </AppText>
    </View>
  );
}

function QueueCard({ appointment, name }: { appointment: Appointment; name: string }) {
  const { colors } = useTheme();
  const status = appointment.status;
  const badge = status === 'consult' ? colors.blueSoft : status === 'done' ? colors.brandSoft : colors.amberSoft;
  const badgeText: keyof Palette = status === 'consult' ? 'blue' : status === 'done' ? 'brandText' : 'amber';

  return (
    <View
      role="group"
      aria-label={`Queue number ${appointment.queueNo}: ${name}`}
      style={[styles.queueCard, { backgroundColor: colors.surface, borderColor: colors.line, opacity: status === 'done' ? 0.85 : 1 }]}
    >
      <View style={[styles.number, { backgroundColor: badge }]}>
        <AppText weight={800} size={22} color={badgeText}>
          {appointment.queueNo}
        </AppText>
      </View>
      <View style={styles.queueText}>
        <AppText weight={700} size={16} numberOfLines={1}>
          {name}
        </AppText>
        <AppText size={13} color="muted" numberOfLines={1}>
          {`${appointment.time} · ${appointment.reason}`}
        </AppText>
      </View>
      <QueueAction appointment={appointment} />
    </View>
  );
}

const pointer = Platform.select<ViewStyle>({ web: { cursor: 'pointer' } });

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2, marginBottom: 20 },
  name: { letterSpacing: 0.5, maxWidth: '100%' },
  pill: {
    alignSelf: 'center',
    alignItems: 'center',
    minWidth: 220,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 26,
  },
  circles: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 26 },
  circleWrap: { flex: 1, alignItems: 'center', gap: 8 },
  circle: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  circleLabel: { textAlign: 'center' },
  glanceScroll: { marginHorizontal: -16 },
  glance: { gap: 12, paddingHorizontal: 16 },
  glanceCard: { width: 168, minHeight: 112, borderRadius: 16, padding: 16, justifyContent: 'space-between', gap: 6 },
  glanceValue: { lineHeight: 36 },
  queue: { gap: 12 },
  queueCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  number: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  queueText: { flex: 1 },
  empty: { borderRadius: 16, borderWidth: 1 },
});
