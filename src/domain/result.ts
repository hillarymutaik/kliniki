/** Error messages keyed by form field; `_form` is for problems that belong to no single field. */
export type Errors<K extends string = never> = Partial<Record<K | '_form', string>>;

export type Ok<T> = { ok: true; value: T };
export type Fail<K extends string = never> = { ok: false; errors: Errors<K> };
export type Result<T, K extends string = never> = Ok<T> | Fail<K>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const fail = <K extends string = never>(errors: Errors<K>): Fail<K> => ({ ok: false, errors });

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;
