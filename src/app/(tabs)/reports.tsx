import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToast } from '@/components/feedback/Toast';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { billsToCsv } from '@/domain/csv';
import { kes } from '@/domain/money';
import { revenueByDay, revenueByMethod, topDrugs } from '@/domain/stats';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';
import { useTheme } from '@/theme/theme';

type Dispensed = { name: string; qty: number };

const DISPENSED_COLUMNS: Column<Dispensed>[] = [
  { key: 'name', title: 'Drug', flex: 3, primary: true, render: (d) => d.name },
  {
    key: 'qty',
    title: 'Dispensed',
    align: 'right',
    render: (d) => (
      <AppText size={14} weight={700}>
        {d.qty}
      </AppText>
    ),
  },
];

export default function ReportsScreen() {
  const data = useData();
  const toast = useToast();
  const today = useToday();

  const days = useMemo(() => revenueByDay(data.bills, today).map((d) => ({ label: d.date.slice(5), total: d.total })), [data.bills, today]);
  const methods = useMemo(() => revenueByMethod(data.bills).map((m) => ({ label: m.method, total: m.total })), [data.bills]);
  const dispensed = useMemo(() => topDrugs(data.bills), [data.bills]);

  async function exportCsv() {
    try {
      await Clipboard.setStringAsync(billsToCsv(data.bills, data.patients));
      toast('Bills copied as CSV');
    } catch {
      toast('Copy failed');
    }
  }

  return (
    <Screen>
      <ScreenHeader
        moreBack
        title="Reports"
        subtitle="All-time totals from this device"
        actions={<Button variant="ghost" label="Export bills (CSV)" onPress={exportCsv} />}
      />

      <Panel title="Revenue, last 7 days">
        <Bars rows={days} />
      </Panel>

      <Panel title="Revenue by payment method">
        {methods.length > 0 ? <Bars rows={methods} /> : <EmptyState message="No bills yet." />}
      </Panel>

      <Panel title="Most dispensed drugs">
        <DataTable
          columns={DISPENSED_COLUMNS}
          rows={dispensed}
          keyOf={(d) => d.name}
          empty={<EmptyState message="Nothing dispensed yet." />}
        />
      </Panel>
    </Screen>
  );
}

/** Horizontal bars scaled to the biggest value. */
function Bars({ rows }: { rows: { label: string; total: number }[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <View style={styles.bars}>
      {rows.map((row) => (
        <View key={row.label} style={styles.bar} accessible accessibilityLabel={`${row.label}: ${kes(row.total)}`}>
          <AppText size={13} color="muted" style={styles.barLabel}>
            {row.label}
          </AppText>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(row.total / max) * 100}%`, backgroundColor: colors.brand }]} />
          </View>
          <AppText size={13} style={styles.barValue}>
            {kes(row.total)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { paddingVertical: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 16 },
  barLabel: { width: 64 },
  track: { flex: 1 },
  fill: { height: 14, borderRadius: 3 },
  barValue: { minWidth: 84, textAlign: 'right' },
});
