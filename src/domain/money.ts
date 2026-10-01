/** 1234567 -> "1,234,567". Done by hand because Intl locale data is not guaranteed on every Hermes build. */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [whole, fraction] = Math.abs(rounded).toString().split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

/** 1750 -> "KES 1,750" */
export const kes = (n: number | null | undefined): string => `KES ${formatNumber(Number(n) || 0)}`;
