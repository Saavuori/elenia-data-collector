import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';
import { createContext, useContext } from 'react';

/** Elenia green, expanded into a Fluent brand ramp. */
const brand: BrandVariants = {
  10: '#131C03',
  20: '#1F2E05',
  30: '#2C4304',
  40: '#395606',
  50: '#456907',
  60: '#527D08',
  70: '#5E9009',
  80: '#6BA30A',
  90: '#78B60C',
  100: '#87CE0D',
  110: '#97E60F',
  120: '#A5F122',
  130: '#B3F344',
  140: '#C3F66A',
  150: '#D2EAA9',
  160: '#EAF5D6',
};

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", ' +
  'Roboto, "Helvetica Neue", Arial, sans-serif';

/** Every colour the app paints with. Both themes expose the same keys so
 *  components can stay theme-agnostic. */
export interface Palette {
  scheme: 'dark' | 'light';
  bg: string;
  /** Translucent backdrop for the sticky app bar / tab bar. */
  glass: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Series colours — energy, spot price, cost. Tuned per theme so the
   *  chart keeps its contrast on both backgrounds. */
  energy: string;
  spot: string;
  cost: string;
  energySoft: string;
  spotSoft: string;
  costSoft: string;
  positive: string;
  negative: string;
  grid: string;
  shadowCard: string;
  shadowRaised: string;
  tooltipBg: string;
}

const dark: Palette = {
  scheme: 'dark',
  bg: '#090C09',
  glass: 'rgba(9, 12, 9, 0.72)',
  surface: '#121712',
  surfaceAlt: '#1A201A',
  border: '#232A23',
  borderStrong: '#333C33',
  text: '#ECF1EB',
  textMuted: '#98A498',
  textFaint: '#6A756A',
  energy: '#7CC80C',
  spot: '#F0B429',
  cost: '#A78BFA',
  energySoft: 'rgba(124, 200, 12, 0.14)',
  spotSoft: 'rgba(240, 180, 41, 0.14)',
  costSoft: 'rgba(167, 139, 250, 0.14)',
  positive: '#4ADE80',
  negative: '#F87171',
  grid: 'rgba(255, 255, 255, 0.06)',
  shadowCard: '0 1px 2px rgba(0, 0, 0, 0.4)',
  shadowRaised: '0 12px 32px -16px rgba(0, 0, 0, 0.9)',
  tooltipBg: 'rgba(18, 23, 18, 0.96)',
};

const light: Palette = {
  scheme: 'light',
  bg: '#F3F6F1',
  glass: 'rgba(243, 246, 241, 0.8)',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F4EC',
  border: '#E3E8DE',
  borderStrong: '#CFD8C9',
  text: '#0F150F',
  textMuted: '#5B665B',
  textFaint: '#8B958B',
  energy: '#5C9A07',
  spot: '#B57F04',
  cost: '#6D45E8',
  energySoft: 'rgba(92, 154, 7, 0.10)',
  spotSoft: 'rgba(181, 127, 4, 0.10)',
  costSoft: 'rgba(109, 69, 232, 0.10)',
  positive: '#15803D',
  negative: '#DC2626',
  grid: 'rgba(15, 21, 15, 0.07)',
  shadowCard: '0 1px 2px rgba(16, 24, 16, 0.05)',
  shadowRaised: '0 12px 32px -16px rgba(16, 24, 16, 0.35)',
  tooltipBg: 'rgba(255, 255, 255, 0.98)',
};

export const PALETTES = { dark, light } as const;

/** Fluent's own tokens are re-pointed at the palette so its inputs, switches
 *  and message bars sit flush with the hand-rolled surfaces. */
const applyToFluent = (base: Theme, p: Palette): Theme => ({
  ...base,
  fontFamilyBase: FONT_FAMILY,
  colorNeutralBackground1: p.surface,
  colorNeutralBackground2: p.surfaceAlt,
  colorNeutralBackground3: p.surfaceAlt,
  colorNeutralForeground1: p.text,
  colorNeutralForeground2: p.text,
  colorNeutralForeground3: p.textMuted,
  colorNeutralForeground4: p.textFaint,
  colorNeutralStroke1: p.borderStrong,
  colorNeutralStroke2: p.border,
  colorNeutralStroke3: p.border,
});

export const darkTheme: Theme = {
  ...applyToFluent(createDarkTheme(brand), dark),
  // The generated dark ramp picks a brand foreground that is too dim on our
  // near-black background.
  colorBrandForeground1: brand[110],
  colorBrandForeground2: brand[120],
};

export const lightTheme: Theme = applyToFluent(createLightTheme(brand), light);

/** Mirror the palette onto CSS custom properties so plain CSS (and Griffel
 *  rules, which are static) can reference the active theme. */
export function applyPaletteToDocument(p: Palette) {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--bg': p.bg,
    '--glass': p.glass,
    '--surface': p.surface,
    '--surface-alt': p.surfaceAlt,
    '--border': p.border,
    '--border-strong': p.borderStrong,
    '--text': p.text,
    '--text-muted': p.textMuted,
    '--text-faint': p.textFaint,
    '--energy': p.energy,
    '--spot': p.spot,
    '--cost': p.cost,
    '--energy-soft': p.energySoft,
    '--spot-soft': p.spotSoft,
    '--cost-soft': p.costSoft,
    '--positive': p.positive,
    '--negative': p.negative,
    '--shadow-card': p.shadowCard,
    '--shadow-raised': p.shadowRaised,
  };
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.dataset.theme = p.scheme;
  root.style.colorScheme = p.scheme;

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}

const PaletteContext = createContext<Palette>(dark);
export const PaletteProvider = PaletteContext.Provider;

/** Colours for anything that can't go through CSS variables — Recharts props,
 *  inline SVG fills and the like. */
export const usePalette = () => useContext(PaletteContext);
