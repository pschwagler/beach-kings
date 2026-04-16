/**
 * Unified Color Tokens
 * Source of truth: mobile-audit/wireframes/design-tokens.css
 * Both light and dark palettes defined here.
 */

export const colors = {
  // Brand
  primary: '#1a3a4a',
  primaryLight: '#2a5a6a',
  accent: '#d4a843',
  accentLight: '#e8c96a',

  // Semantic
  success: '#34a853',
  danger: '#dc3545',
  warning: '#f0ad4e',
  info: '#3b82f6',

  // Semantic tinted backgrounds (light mode chips, badges, highlight rows)
  tealTint: '#e8f4f8',
  goldTint: '#fdf8ed',
  successTint: '#dcfce7',
  dangerTint: '#fee2e2',
  warningTint: '#fef3c7',
  infoTint: '#dbeafe',

  // Neutrals
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textInverse: '#ffffff',

  // Disabled state
  disabledBg: '#e8e8e8',
  disabledText: '#aaaaaa',

  // Backgrounds
  bgPrimary: '#f5f5f5',
  bgSurface: '#ffffff',
  bgNav: '#1a3a4a',

  // Borders
  border: '#e0e0e0',

  // Gray scale (full)
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#eeeeee',
  gray300: '#e0e0e0',
  gray400: '#bdbdbd',
  gray500: '#9e9e9e',
  gray600: '#757575',
  gray700: '#616161',
  gray800: '#424242',
  gray900: '#212121',

  // Pure
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const darkColors = {
  // Backgrounds (three-tier surface hierarchy)
  bgBase: '#0d1117',
  bgSurface: '#161b22',
  bgElevated: '#1c2128',
  bgInset: '#0d1117',
  bgNav: '#010409',
  bgTabbar: '#0d1117',

  // Text
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textTertiary: '#656d76',

  // Brand (adjusted for dark backgrounds)
  brandTeal: '#4daacc',
  brandGold: '#e0b44c',

  // Borders
  border: '#30363d',
  borderSubtle: '#21262d',

  // Semantic (background + text pairs)
  successBg: '#0d2818',
  successText: '#3fb950',
  dangerBg: '#2a1215',
  dangerText: '#f85149',
  warningBg: '#2a1f05',
  warningText: '#d29922',
  infoBg: '#0d1d35',
  infoText: '#58a6ff',
} as const;

export type ColorName = keyof typeof colors;
export type DarkColorName = keyof typeof darkColors;
