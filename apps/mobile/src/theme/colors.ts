/**
 * Color theme for Beach League app
 * Matches the web app's vintage Malibu beach theme
 */

export const colors = {
  // Primary colors
  sunsetOrange: '#ff6b35',
  oceanBlue: '#4a90a4',
  sand: '#f4e4c1',
  
  // Secondary colors
  deepBlue: '#2c5f7a',
  lightBlue: '#7fb3c3',
  cream: '#faf8f3',
  darkSand: '#e8d4a8',
  
  // Text colors
  textPrimary: '#333333',
  textSecondary: '#666666',
  textLight: '#999999',
  textWhite: '#ffffff',
  
  // Status colors
  success: '#4caf50',
  error: '#f44336',
  warning: '#ff9800',
  info: '#2196f3',
  
  // Background colors
  background: '#f4e4c1',
  backgroundLight: '#faf8f3',
  backgroundDark: '#e8d4a8',
  
  // Border colors
  border: '#d4c4a0',
  borderLight: '#e8d4a8',
  
  // Shadow
  shadow: 'rgba(0, 0, 0, 0.1)',
} as const;

export type ColorName = keyof typeof colors;





