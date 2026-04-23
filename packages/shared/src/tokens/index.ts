/**
 * Unified Design Tokens
 * Single source of truth for design system values
 * Source: mobile-audit/wireframes/design-tokens.css
 */

export * from './colors';
export * from './spacing';
export * from './typography';
export * from './shadows';
export * from './layout';
export * from './opacity';
export * from './animation';
export * from './zIndex';

import { colors, darkColors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { shadows, darkShadows, rnShadows } from './shadows';
import { layout } from './layout';
import { opacity } from './opacity';
import { duration, easing } from './animation';
import { zIndex } from './zIndex';

export const tokens = {
  colors,
  darkColors,
  spacing,
  typography,
  shadows,
  darkShadows,
  rnShadows,
  layout,
  opacity,
  duration,
  easing,
  zIndex,
} as const;
