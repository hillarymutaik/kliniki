import { useMemo } from 'react';

import { useModals } from '@/components/modals/ModalHost';
import { QueueAction } from '@/components/shared/QueueAction';
import { ApptStatusTag } from '@/components/shared/status-tags';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { findPatient } from '@/domain/patients';
import type { Appointment } from '@/domain/types';
import { useData } from '@/store/hooks';

export default function AppointmentsScreen() {
  const data = useData();
  const modals = useModals();

  // Latest first.
  const appointments = useMemo(
    () => [...data.appointments].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [data.appointments],
  );

  const columns = useMemo<Column<Appointment>[]>(
    () => [
      { key: 'date', title: 'Date', render: (a) => a.date },
      { key: 'time', title: 'Time', flex: 0.6, minWidth: 70, render: (a) => a.time },
      {
        key: 'patient',
        title: 'Patient',
        flex: 1.5,
        primary: true,
        render: (a) => findPatient(data, a.patientId)?.name ?? 'Unknown',
      },
      { key: 'reason', title: 'Reason', flex: 1.5, render: (a) => a.reason },
      { key: 'status', title: 'Status', render: (a) => <ApptStatusTag status={a.status} /> },
      { key: 'action', title: '', actions: true, render: (a) => <QueueAction appointment={a} /> },
    ],
    [data],
  );

  return (
    <Screen>
      <ScreenHeader
        moreBack
        title="Appointments"
        subtitle="Book, then move patients through the queue"
        actions={<Button label="Book appointment" onPress={() => modals.openAppointmentForm()} />}
      />
      <Panel>
        <DataTable
          columns={columns}
          rows={appointments}
          keyOf={(a) => a.id}
          empty={<EmptyState message="No appointments yet. Book the first one." />}
        />
      </Panel>
    </Screen>
  );
}
