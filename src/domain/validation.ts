export const stripWhitespace = (value: string) => value.replace(/\s/g, '');

/** Kenyan mobile numbers in local format: 07XXXXXXXX or 01XXXXXXXX. Spaces are ignored. */
export const isValidKenyanPhone = (value: string) => /^0[17]\d{8}$/.test(stripWhitespace(value));

/** M-Pesa confirmation codes are 10 letters and digits, e.g. SIJ4K2LQ8P. */
export const isValidMpesaCode = (value: string) => /^[A-Z0-9]{10}$/i.test(value);

/** Parses a whole number typed into a form field. Null for blank input or anything that is not plain digits. */
export function parseWhole(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/** Zero-pads a running number for document numbers such as INV-0007. */
export const padNumber = (n: number) => String(n).padStart(4, '0');
