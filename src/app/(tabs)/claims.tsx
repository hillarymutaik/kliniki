import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback/Toast';
import { ClaimStatusTag } from '@/components/shared/status-tags';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Stat, StatGrid } from '@/components/ui/Stat';
import { kes } from '@/domain/money';
import { findPatient } from '@/domain/patients';
import type { Claim, ClaimStatus } from '@/domain/types';
import { useActions, useData } from '@/store/hooks';

const STATUSES: ClaimStatus[] = ['Draft', 'Submitted', 'Approved', 'Rejected'];

export default function ClaimsScreen() {
  const data = useData();
  const { setClaimStatus } = useActions();
  const toast = useToast();

  // Newest first.
  const claims = useMemo(() => [...data.claims].reverse(), [data.claims]);
  const totals = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        amount: data.claims.filter((c) => c.status === status).reduce((sum, c) => sum + c.amount, 0),
      })),
    [data.claims],
  );

  const columns = useMemo<Column<Claim>[]>(() => {
    const move = (claim: Claim, status: ClaimStatus) => {
      const result = setClaimStatus(claim.id, status);
      toast(result.ok ? `Claim marked ${status.toLowerCase()}` : (result.errors._form ?? 'Could not update the claim'));
    };

    return [
      {
        key: 'no',
        title: 'Claim',
        flex: 0.9,
        primary: true,
        render: (c) => (
          <AppText size={14} weight={700}>
            {c.no}
          </AppText>
        ),
      },
      { key: 'date', title: 'Date', render: (c) => c.date },
      { key: 'patient', title: 'Patient', flex: 1.4, render: (c) => findPatient(data, c.patientId)?.name ?? 'Unknown' },
      { key: 'sha', title: 'SHA no.', render: (c) => findPatient(data, c.patientId)?.sha || '—' },
      { key: 'amount', title: 'Amount', render: (c) => kes(c.amount) },
      { key: 'status', title: 'Status', render: (c) => <ClaimStatusTag status={c.status} /> },
      {
        key: 'action',
        title: '',
        actions: true,
        minWidth: 170,
        render: (c) =>
          c.status === 'Draft' ? (
            <Button size="sm" label="Mark submitted" onPress={() => move(c, 'Submitted')} />
          ) : c.status === 'Submitted' ? (
            <View style={styles.decide}>
              <Button size="sm" label="Approved" onPress={() => move(c, 'Approved')} />
              <Button size="sm" variant="ghost" label="Rejected" onPress={() => move(c, 'Rejected')} />
            </View>
          ) : null,
      },
    ];
  }, [data, setClaimStatus, toast]);

  return (
    <Screen>
      <ScreenHeader moreBack title="SHA claims" subtitle="Bills paid via SHA create a draft claim here" />
      <StatGrid>
        {totals.map(({ status, amount }) => (
          <Stat key={status} value={kes(amount)} label={status} />
        ))}
      </StatGrid>
      <Panel>
        <DataTable
          columns={columns}
          rows={claims}
          keyOf={(c) => c.id}
          empty={<EmptyState message="No claims yet. Bill an SHA patient and choose SHA as the payment method." />}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  decide: { flexDirection: 'row', gap: 8 },
});
