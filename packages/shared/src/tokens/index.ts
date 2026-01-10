/**
 * Unified Design Tokens
 * Single source of truth for design system values
 * Extracted from web App.css root variables and mobile theme
 */

export * from './colors';
export * from './spacing';
export * from './typography';
export * from './shadows';
export * from './layout';

import { colors } from './colors';
import { spacing } from './spacing';
import { typography, fontFamily, fontSizes, fontWeights } from './typography';
import { shadows } from './shadows';
import { layout } from './layout';

// Explicitly re-export typography tokens for easier access
export { fontFamily, fontSizes, fontWeights };

export const tokens = {
  colors,
  spacing,
  typography,
  shadows,
  layout,
} as const;

