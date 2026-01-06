/**
 * Unified Color Tokens
 * Extracted from web App.css :root variables
 * Serves as single source of truth for colors across mobile and web
 */

export const colors = {
  // Primary palette
  primary: '#2c7a8f',
  primaryLight: '#5faec0',
  primaryLighter: '#bfe1e7',
  primaryDark: '#205e6f',
  primaryDarker: '#183f4a',

  // Sunset/Coral palette
  mutedRed: '#ff7849',
  sunsetDark: '#e76a41',
  sunsetLight: '#ff9673',
  coral: '#ff9a76',
  coralLight: '#ffc7b3',
  coralDark: '#e08361',
  
  // Sand/Warm palette
  sand: '#f4e4c1',
  sandLight: '#faf0d8',
  sandDark: '#d6c19c',
  warmBrown: '#8b6f47',
  warmBrownLight: '#b89a6d',
  warmBrownDark: '#6b5334',

  // Ocean/Seafoam palette
  deepOcean: '#2c7a8f',
  seafoam: '#8ed4c6',
  seafoamLight: '#c9eee6',
  seafoamDark: '#5fa79b',
  oceanGray: '#9aa7a9',
  oceanGrayLight: '#c4cfd1',
  oceanGrayDark: '#6f7b7d',
  oceanGrayDarker: '#3d4445',

  // Gold palette
  sunGold: '#ffd78a',
  sunGoldLight: '#ffebc2',
  sunGoldDark: '#e7b662',
  goldText: '#ecd36f',
  goldDark: '#b68b34',
  goldGradient: 'linear-gradient(90deg, #c9a652 0%, #ecd36f 50%, #b68b34 100%)',

  // Dusk/Purple palette
  duskPurple: '#4c3a4d',
  duskPurpleLight: '#7a6780',
  duskPurpleDark: '#342735',

  // Navy
  navyLogoBg: '#0f172a',

  // Gray scale
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#eeeeee',
  gray300: '#e0e0e0',
  gray600: '#757575',
  gray700: '#616161',
  gray900: '#212121',

  // Functional colors
  success: '#10b981',
  successDark: '#059669',
  successLight: '#e8fbf0',
  danger: '#ef4444',
  dangerLight: '#ffeceb',

  // Legacy mobile app color mappings (for backward compatibility)
  // These map to the above unified tokens
  sunsetOrange: '#ff6b35', // Maps to sunsetDark but keeping original for now
  oceanBlue: '#4a90a4',
  deepBlue: '#2c5f7a',
  lightBlue: '#7fb3c3',
  cream: '#faf8f3',
  darkSand: '#e8d4a8',

  // Text colors
  textPrimary: '#333333',
  textSecondary: '#757575',
  textLight: '#e0e0e0',
  textWhite: '#ffffff',

  // Status colors (legacy)
  error: '#f44336',
  warning: '#ff9800',
  info: '#2196f3',

  // Background colors
  background: '#ffffff',
  backgroundLight: '#fdfdfd',
  backgroundDark: '#fafafa',

  // Border colors
  border: '#eeeeee',
  borderLight: '#f5f5f5',

  // Shadow
  shadow: 'rgba(0, 0, 0, 0.1)',
} as const;

export type ColorName = keyof typeof colors;




