import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { QueueAction } from '@/components/shared/QueueAction';
import { useModals } from '@/components/modals/ModalHost';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Stat, StatGrid } from '@/components/ui/Stat';
import { formatLongDate } from '@/domain/dates';
import { kes } from '@/domain/money';
import { findPatient } from '@/domain/patients';
import { dashboardStats } from '@/domain/stats';
import type { Appointment } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';
import { useTheme } from '@/theme/theme';

export default function TodayScreen() {
  const data = useData();
  const modals = useModals();
  const today = useToday();

  const stats = useMemo(() => dashboardStats(data, today), [data, today]);
  const queue = useMemo(
    () => data.appointments.filter((a) => a.date === today).sort((a, b) => a.queueNo - b.queueNo),
    [data.appointments, today],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Today"
        subtitle={formatLongDate(today)}
        actions={<Button label="Add walk-in" onPress={() => modals.openAppointmentForm({ walkIn: true })} />}
      />

      <StatGrid>
        <Stat value={stats.inQueue} label="Patients waiting or in consult" />
        <Stat value={kes(stats.collectedToday)} label="Collected today" />
        <Stat value={stats.lowStock} label="Drugs at reorder level" valueColor={stats.lowStock ? 'amber' : 'ink'} />
        <Stat value={stats.expiring} label="Drugs expiring within 60 days" valueColor={stats.expiring ? 'red' : 'ink'} />
        <Stat value={kes(stats.pendingClaims.amount)} label={`${stats.pendingClaims.count} SHA claims pending`} />
      </StatGrid>

      <Panel title="Queue">
        {queue.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queue}>
            {queue.map((appointment) => (
              <Ticket
                key={appointment.id}
                appointment={appointment}
                name={findPatient(data, appointment.patientId)?.name ?? 'Unknown'}
              />
            ))}
          </ScrollView>
        ) : (
          <EmptyState message="No patients booked today. Add a walk-in to start the queue." />
        )}
      </Panel>
    </Screen>
  );
}

function Ticket({ appointment, name }: { appointment: Appointment; name: string }) {
  const { colors } = useTheme();
  // The left edge shows where the patient is: amber waiting, blue in the room, green seen.
  const accent = appointment.status === 'consult' ? colors.blue : appointment.status === 'done' ? colors.brand : colors.amber;

  return (
    <View
      role="group"
      aria-label={`Queue number ${appointment.queueNo}: ${name}`}
      style={[
        styles.ticket,
        {
          backgroundColor: colors.bg,
          borderColor: colors.line,
          borderLeftColor: accent,
          opacity: appointment.status === 'done' ? 0.7 : 1,
        },
      ]}
    >
      <AppText weight={800} size={30} style={styles.number}>
        {appointment.queueNo}
      </AppText>
      <AppText weight={600} style={styles.name}>
        {name}
      </AppText>
      <AppText size={13} color="muted">
        {`${appointment.time} · ${appointment.reason}`}
      </AppText>
      <View style={styles.action}>
        <QueueAction appointment={appointment} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  queue: { gap: 12, padding: 16 },
  ticket: {
    width: 200,
    borderWidth: 1,
    borderLeftWidth: 6,
    borderRadius: 8,
    padding: 12,
  },
  number: { lineHeight: 32 },
  name: { marginTop: 6 },
  action: { marginTop: 10, alignItems: 'flex-start' },
});
