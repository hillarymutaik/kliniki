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

// Same green-and-navy identity as the prototype, tuned for brightness and legibility. The light page
// is a touch whiter and its borders and secondary text a touch stronger; the dark theme is a lifted
// slate rather than near-black. Every text pairing meets WCAG AA (4.5:1), and `onBrand` is dark in the
// dark theme because the brighter green needs dark text on it.
export const lightPalette: Palette = {
  bg: '#F4F8F6',
  surface: '#FFFFFF',
  ink: '#12263A',
  muted: '#4F5F6B',
  line: '#CBD7D2',
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
  bg: '#1A2B3A',
  surface: '#243A4D',
  ink: '#F2F7FA',
  muted: '#B4C3CF',
  line: '#3E566B',
  brand: '#46C79A',
  brandSoft: '#1F4D3E',
  brandText: '#63DDB2',
  onBrand: '#06150F',
  amber: '#F2B45C',
  amberSoft: '#4D3A1A',
  red: '#FF9188',
  redSoft: '#5C2B29',
  blue: '#86BCF6',
  blueSoft: '#21425F',
  side: '#13293C',
  sideInk: '#C9D8E4',
  overlay: 'rgba(10, 20, 30, 0.5)',
};
