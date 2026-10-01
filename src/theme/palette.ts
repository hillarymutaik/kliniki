export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
  brandSoft: string;
  /** Green for text sitting on `brandSoft`. */
  brandText: string;
  /** Text on top of a `brand` fill. */
  onBrand: string;
  amber: string;
  amberSoft: string;
  red: string;
  redSoft: string;
  blue: string;
  blueSoft: string;
  side: string;
  sideInk: string;
  overlay: string;
}

// Colours come from the Kliniki prototype. Two light-theme values are a touch darker than the original
// (amber and brandText) and `onBrand` is dark in the dark theme, so small text meets WCAG AA contrast.
export const lightPalette: Palette = {
  bg: '#EEF2F0',
  surface: '#FFFFFF',
  ink: '#12263A',
  muted: '#5B6B78',
  line: '#D6DEDA',
  brand: '#1F7A5A',
  brandSoft: '#DDEFE7',
  brandText: '#17644A',
  onBrand: '#FFFFFF',
  amber: '#9A5B00',
  amberSoft: '#FBEBD2',
  red: '#B3261E',
  redSoft: '#F8DEDC',
  blue: '#1D5FA8',
  blueSoft: '#DCE8F6',
  side: '#12263A',
  sideInk: '#C9D6E0',
  overlay: 'rgba(10, 20, 30, 0.5)',
};

export const darkPalette: Palette = {
  bg: '#0F1A22',
  surface: '#16242F',
  ink: '#E4ECF1',
  muted: '#93A4B1',
  line: '#26394A',
  brand: '#3FB889',
  brandSoft: '#173A2E',
  brandText: '#3FB889',
  onBrand: '#08140F',
  amber: '#E0A04A',
  amberSoft: '#3A2C16',
  red: '#EF7B73',
  redSoft: '#3D1F1D',
  blue: '#6FA8E8',
  blueSoft: '#18304A',
  side: '#0A131A',
  sideInk: '#9FB2C1',
  overlay: 'rgba(10, 20, 30, 0.5)',
};
