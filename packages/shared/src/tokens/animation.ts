/**
 * Unified Animation Tokens
 * Duration and easing values for consistent motion.
 *
 * Durations: wired into Tailwind as `duration-fast`, `duration-normal`, etc.
 *   Also importable for Reanimated `withTiming({ duration: duration.normal })`.
 *
 * Easings: wired into Tailwind as `ease-out`, `ease-in`, `ease-in-out`, `ease-spring`.
 *   Also importable for Reanimated `Easing.bezier(...easing.spring)`.
 */

export const duration = {
  /** Micro-interactions: checkbox, toggle, color change */
  fast: 150,
  /** Standard transitions: fade, slide, expand */
  normal: 200,
  /** Deliberate motion: modal enter, sheet slide, page transition */
  slow: 300,
  /** Large-scale motion: onboarding, splash */
  slower: 500,
} as const;

/**
 * Cubic bezier easing curves.
 * Format: [x1, y1, x2, y2] for Reanimated Easing.bezier().
 */
export const easing = {
  /** Standard ease-out for entrances */
  out: [0.25, 0.46, 0.45, 0.94] as const,
  /** Standard ease-in for exits */
  in: [0.55, 0.06, 0.68, 0.19] as const,
  /** Smooth ease-in-out for symmetric transitions */
  inOut: [0.42, 0, 0.58, 1] as const,
  /** iOS-style spring-like curve */
  spring: [0.2, 0.8, 0.2, 1] as const,
} as const;

export type DurationName = keyof typeof duration;
export type EasingName = keyof typeof easing;
