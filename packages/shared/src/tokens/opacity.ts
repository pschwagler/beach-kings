/**
 * Unified Opacity Tokens
 * Standard values for interactive states, overlays, and disabled elements.
 */

export const opacity = {
  /** Disabled buttons, inactive controls */
  disabled: 0.4,
  /** Pressed/active state feedback */
  pressed: 0.7,
  /** Modal/sheet backdrop overlay */
  overlay: 0.5,
  /** Translucent button backgrounds on nav (rgba white) */
  translucent: 0.15,
  /** Subtle hover/focus hint */
  hover: 0.08,
} as const;

export type OpacityName = keyof typeof opacity;
