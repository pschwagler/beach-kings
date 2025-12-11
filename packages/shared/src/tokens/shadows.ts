/**
 * Unified Shadow Tokens
 * Extracted from web App.css :root variables
 * Warm shadows that fit the beach palette
 */

export const shadows = {
  sm: '0 1px 2px 0 rgb(150 110 80 / 0.06)',
  md: '0 4px 6px -1px rgb(150 110 80 / 0.1)',
  lg: '0 10px 15px -3px rgb(150 110 80 / 0.12)',
  xl: '0 20px 25px -5px rgb(150 110 80 / 0.15)',
} as const;

export type ShadowName = keyof typeof shadows;


