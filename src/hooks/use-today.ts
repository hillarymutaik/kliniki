import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextDay, today } from '@/domain/dates';

/**
 * Today's date in EAT. It moves on at midnight and when the app returns to the foreground, so a
 * reception tablet that is left open overnight never shows yesterday's queue as today's.
 */
export function useToday(): string {
  const [date, setDate] = useState(() => today());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setDate(today());
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextDay() + 1000);
    };
    schedule();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return date;
}
