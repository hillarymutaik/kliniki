import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useModals } from '@/components/modals/ModalHost';
import { ApptStatusTag, PayMethodTag } from '@/components/shared/status-tags';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ageYears } from '@/domain/dates';
import { kes } from '@/domain/money';
import { findPatient } from '@/domain/patients';
import type { Appointment, Bill } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';
import { useTheme } from '@/theme/theme';

const VISIT_COLUMNS: Column<Appointment>[] = [
  { key: 'when', title: 'When', render: (a) => `${a.date} ${a.time}` },
  { key: 'reason', title: 'Reason', flex: 2, render: (a) => a.reason },
  { key: 'status', title: 'Status', render: (a) => <ApptStatusTag status={a.status} /> },
];

const BILL_COLUMNS: Column<Bill>[] = [
  { key: 'no', title: 'Invoice', render: (b) => b.no },
  { key: 'date', title: 'Date', render: (b) => b.date },
  { key: 'items', title: 'Items', flex: 2, render: (b) => b.lines.map((l) => l.name).join(', ') },
  { key: 'method', title: 'Paid by', render: (b) => <PayMethodTag method={b.method} /> },
  {
    key: 'total',
    title: 'Total',
    align: 'right',
    render: (b) => (
      <AppText size={14} weight={700}>
        {kes(b.total)}
      </AppText>
    ),
  },
];

export default function PatientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useData();
  const modals = useModals();
  const { colors } = useTheme();
  const today = useToday();
  const patient = findPatient(data, id);

  // Newest first.
  const visits = useMemo(() => data.appointments.filter((a) => a.patientId === id).reverse(), [data.appointments, id]);
  const bills = useMemo(() => data.bills.filter((b) => b.patientId === id).reverse(), [data.bills, id]);

  if (!patient) {
    return (
      <Screen>
        <ScreenHeader title="Patient not found" back={{ label: 'Patients', href: '/patients' }} />
        <Panel>
          <EmptyState message="Patient not found." />
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        back={{ label: 'Patients', href: '/patients' }}
        title={patient.name}
        subtitle={`${patient.sex === 'F' ? 'Female' : 'Male'}, ${ageYears(patient.dob, today)} yrs · ${patient.phone} · ${
          patient.sha || 'No SHA number'
        }`}
        actions={
          <>
            <Button variant="ghost" label="Edit" onPress={() => modals.openPatientForm(patient.id)} />
            <Button label="New bill" onPress={() => modals.openBill(patient.id)} />
          </>
        }
      />

      {patient.allergies ? (
        <Panel style={[styles.allergy, { backgroundColor: colors.redSoft, borderColor: colors.line }]}>
          <AppText role="alert" weight={600} color="red">
            {`Allergy: ${patient.allergies}`}
          </AppText>
        </Panel>
      ) : null}

      <Panel title="Visits">
        <DataTable
          columns={VISIT_COLUMNS}
          rows={visits}
          keyOf={(a) => a.id}
          empty={<EmptyState message="No visits recorded." />}
        />
      </Panel>

      <Panel title="Bills">
        <DataTable
          columns={BILL_COLUMNS}
          rows={bills}
          keyOf={(b) => b.id}
          empty={<EmptyState message="No bills yet." />}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  allergy: { paddingVertical: 12, paddingHorizontal: 16 },
});
