import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useModals } from '@/components/modals/ModalHost';
import { StockTags } from '@/components/shared/status-tags';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { searchDrugs } from '@/domain/drugs';
import { kes } from '@/domain/money';
import { nearestBatch, onHand, stockValue } from '@/domain/stock';
import type { Drug } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';

export default function PharmacyScreen() {
  const data = useData();
  const modals = useModals();
  const today = useToday();
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => () => setQuery(''), []));

  const drugs = useMemo(() => searchDrugs(data.drugs, query), [data.drugs, query]);
  const value = useMemo(() => stockValue(data.drugs, today), [data.drugs, today]);

  const columns = useMemo<Column<Drug>[]>(
    () => [
      {
        key: 'drug',
        title: 'Drug',
        flex: 2,
        minWidth: 150,
        primary: true,
        render: (d) => (
          <View>
            <AppText size={14} weight={700}>
              {d.name}
            </AppText>
            <AppText size={12} color="muted">
              {`${d.batches.length} batch${d.batches.length > 1 ? 'es' : ''}`}
            </AppText>
          </View>
        ),
      },
      { key: 'stock', title: 'In stock', flex: 0.8, render: (d) => `${onHand(d)} ${d.unit}` },
      { key: 'price', title: 'Price', flex: 0.8, render: (d) => kes(d.price) },
      {
        key: 'expiry',
        title: 'Nearest expiry',
        flex: 1.4,
        render: (d) => {
          const batch = nearestBatch(d);
          return batch ? `${batch.exp} (${batch.no})` : '—';
        },
      },
      { key: 'status', title: 'Status', flex: 1.3, render: (d) => <StockTags drug={d} today={today} /> },
      {
        key: 'action',
        title: '',
        actions: true,
        minWidth: 120,
        render: (d) => <Button size="sm" variant="ghost" label="Receive stock" onPress={() => modals.openRestock(d.id)} />,
      },
    ],
    [today, modals],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Pharmacy"
        subtitle={`Stock value ${kes(value)} at selling price`}
        actions={<Button variant="ghost" label="Add drug" onPress={() => modals.openDrugForm()} />}
      />
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search drugs" />
      <Panel>
        <DataTable
          columns={columns}
          rows={drugs}
          keyOf={(d) => d.id}
          empty={
            <EmptyState
              message={query ? `No drug matches “${query}”. Add it to the formulary.` : 'No drugs in the formulary yet. Add the first one.'}
            />
          }
        />
      </Panel>
    </Screen>
  );
}
