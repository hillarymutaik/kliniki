import { useMemo } from 'react';

import { dashboardStats } from '@/domain/stats';
import { useData } from '@/store/hooks';

import { useToday } from './use-today';

/** The day's figures and queue, shared by the wide and phone versions of the Today screen. */
export function useTodayData() {
  const data = useData();
  const today = useToday();
  const stats = useMemo(() => dashboardStats(data, today), [data, today]);
  const queue = useMemo(
    () => data.appointments.filter((a) => a.date === today).sort((a, b) => a.queueNo - b.queueNo),
    [data.appointments, today],
  );
  return { data, today, stats, queue };
}
