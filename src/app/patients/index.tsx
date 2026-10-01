import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useModals } from '@/components/modals/ModalHost';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tag } from '@/components/ui/Tag';
import { AppText } from '@/components/ui/AppText';
import { ageYears } from '@/domain/dates';
import { searchPatients } from '@/domain/patients';
import type { Patient } from '@/domain/types';
import { useToday } from '@/hooks/use-today';
import { useData } from '@/store/hooks';

export default function PatientsScreen() {
  const data = useData();
  const modals = useModals();
  const router = useRouter();
  const today = useToday();
  const [query, setQuery] = useState('');

  // Tabs stay mounted when you leave them, so the search box is cleared explicitly on the way out.
  useFocusEffect(useCallback(() => () => setQuery(''), []));

  const patients = useMemo(() => searchPatients(data.patients, query), [data.patients, query]);

  const columns = useMemo<Column<Patient>[]>(
    () => [
      {
        key: 'name',
        title: 'Name',
        flex: 2,
        minWidth: 140,
        render: (p) => (
          <AppText size={14} weight={700}>
            {p.name}
          </AppText>
        ),
      },
      { key: 'phone', title: 'Phone', render: (p) => p.phone },
      { key: 'age', title: 'Age', flex: 0.5, minWidth: 56, render: (p) => ageYears(p.dob, today) ?? '' },
      {
        key: 'sha',
        title: 'SHA no.',
        render: (p) => (p.sha ? p.sha : <Tag tone="amber">Cash patient</Tag>),
      },
      {
        key: 'allergies',
        title: 'Allergies',
        render: (p) => (p.allergies ? <Tag tone="red">{p.allergies}</Tag> : '—'),
      },
    ],
    [today],
  );

  const empty = query
    ? `No patient matches “${query}”. Check the spelling or register them.`
    : 'No patients registered yet. Register the first one.';

  return (
    <Screen>
      <ScreenHeader
        title="Patients"
        subtitle={`${data.patients.length} registered`}
        actions={<Button label="Register patient" onPress={() => modals.openPatientForm()} />}
      />
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search by name, phone or SHA number" />
      <Panel>
        <DataTable
          columns={columns}
          rows={patients}
          keyOf={(p) => p.id}
          rowLabel={(p) => `Open ${p.name}`}
          onRowPress={(p) => router.push(`/patients/${p.id}`)}
          empty={<EmptyState message={empty} />}
        />
      </Panel>
    </Screen>
  );
}
