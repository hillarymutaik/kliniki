import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useModals } from '@/components/modals/ModalHost';
import { PayMethodTag } from '@/components/shared/status-tags';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { kes } from '@/domain/money';
import { findPatient } from '@/domain/patients';
import type { Bill } from '@/domain/types';
import { useData } from '@/store/hooks';

export default function BillingScreen() {
  const data = useData();
  const modals = useModals();

  // Newest first.
  const bills = useMemo(() => [...data.bills].reverse(), [data.bills]);

  const columns = useMemo<Column<Bill>[]>(
    () => [
      {
        key: 'no',
        title: 'Invoice',
        flex: 0.9,
        primary: true,
        render: (b) => (
          <AppText size={14} weight={700}>
            {b.no}
          </AppText>
        ),
      },
      { key: 'date', title: 'Date', render: (b) => b.date },
      { key: 'patient', title: 'Patient', flex: 1.5, render: (b) => findPatient(data, b.patientId)?.name ?? 'Unknown' },
      { key: 'items', title: 'Items', flex: 0.5, minWidth: 56, render: (b) => b.lines.length },
      {
        key: 'method',
        title: 'Paid by',
        flex: 1.3,
        render: (b) => (
          <View style={styles.paid}>
            <PayMethodTag method={b.method} />
            {b.ref ? (
              <AppText size={12} color="muted">
                {b.ref}
              </AppText>
            ) : null}
          </View>
        ),
      },
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
    ],
    [data],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Billing"
        subtitle="Dispensed drugs are deducted from stock automatically"
        actions={<Button label="New bill" onPress={() => modals.openBill()} />}
      />
      <Panel>
        <DataTable
          columns={columns}
          rows={bills}
          keyOf={(b) => b.id}
          empty={<EmptyState message="No bills yet. Create one after a consultation." />}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  paid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
