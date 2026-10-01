import { useState } from 'react';

import type { Errors } from '@/domain/result';

/** Form values plus the domain's validation errors, kept together so editing a field clears its error. */
export function useFormState<T extends object>(initial: () => T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors<Extract<keyof T, string>>>({});

  /** A change handler for one field. */
  const field =
    <F extends Extract<keyof T, string>>(key: F) =>
    (value: T[F]) => {
      setValues((current) => ({ ...current, [key]: value }));
      setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    };

  return { values, errors, setErrors, field };
}
