import { isValidKenyanPhone, stripWhitespace } from '@domain/validation';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * One sign-in name per person: a Kenyan mobile number or an email. Numbers are stored in local format
 * (0712345678) whichever way they were typed (+254 712 345 678, 254712345678), emails in lower case.
 * Returns null if it is neither.
 */
export function normalizeLogin(raw: string): string | null {
  const text = raw.trim();
  if (EMAIL.test(text)) return text.toLowerCase();

  let digits = stripWhitespace(text).replace(/[()-]/g, '');
  if (digits.startsWith('+254')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('254') && digits.length === 12) digits = `0${digits.slice(3)}`;
  return isValidKenyanPhone(digits) ? digits : null;
}
