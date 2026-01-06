/**
 * Unified Spacing Tokens
 * Spacing scale for consistent layout across mobile and web
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type Spacing = keyof typeof spacing;




