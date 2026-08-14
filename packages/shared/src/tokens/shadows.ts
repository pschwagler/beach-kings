/**
 * Unified Shadow Tokens
 * From design-tokens.css
 *
 * CSS box-shadow strings — NativeWind v4 translates these to
 * React Native shadowOffset/shadowRadius/shadowOpacity/shadowColor.
 *
 * The rnShadows export provides raw RN values for escape-hatch cases
 * (e.g. tab bar style props, Reanimated animated shadows).
 */

export const shadows = {
  none: '0 0 #0000',
  card: '0 1px 3px rgba(0, 0, 0, 0.08)',
  elevated: '0 4px 12px rgba(0, 0, 0, 0.12)',
  nav: '0 1px 0 rgba(0, 0, 0, 0.1)',
} as const;

export const darkShadows = {
  card: '0 1px 3px rgba(0, 0, 0, 0.3)',
  elevated: '0 8px 24px rgba(0, 0, 0, 0.5)',
} as const;

/**
 * React Native shadow objects for escape-hatch usage.
 * Use when className can't reach a shadow prop (e.g. tabBarStyle).
 */
export const rnShadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  nav: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 0,
    elevation: 1,
  },
} as const;

export type ShadowName = keyof typeof shadows;
