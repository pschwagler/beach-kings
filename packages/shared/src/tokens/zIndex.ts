/**
 * Unified Z-Index Tokens
 * Defines the stacking order for layered UI elements.
 * Each layer has clear separation to avoid collisions.
 */

export const zIndex = {
  /** Default content */
  base: 0,
  /** Sticky headers, floating action buttons */
  sticky: 10,
  /** Navigation bars (top nav, tab bar) */
  nav: 20,
  /** Dropdown menus, popovers */
  dropdown: 30,
  /** Modal backdrop + content */
  modal: 40,
  /** Bottom sheets (above modal when stacked) */
  sheet: 50,
  /** Toast notifications */
  toast: 60,
  /** Tooltip overlays */
  tooltip: 70,
} as const;

export type ZIndexName = keyof typeof zIndex;
