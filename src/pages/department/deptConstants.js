// ─── Department Dashboard — Shared Constants & Helpers ──────────

export const CATEGORY_COLORS = {
  SRG: '#B91C1C',
  ERG: '#D97706',
  ERGWS: '#A3A300',
  ERS: '#0F766E',
  IREF: '#3730A3',
  'Pre-IREF': '#78716C',
  NA: '#A8A29E',
};

export const BAND_COLORS = {
  R1: '#0F766E',
  R2: '#3730A3',
  R3: '#D97706',
  R4: '#B91C1C',
};

export const CATEGORY_LABELS = {
  SRG: 'Senior Research Guide',
  ERG: 'Emerging Research Guide',
  ERGWS: 'Emerging Research Guide Without Student',
  ERS: 'Evolving Research Scholar',
  IREF: 'Immersive Research Experience',
  'Pre-IREF': 'Pre - Immersive Research Experience',
  NA: 'Not Applicable',
};

export const AVAILABLE_YEARS = [2021, 2022, 2023, 2024, 2025];

// Framer-motion page transition presets
export const pageVariants = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.07 } },
};

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
};
