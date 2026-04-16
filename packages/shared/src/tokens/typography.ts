/**
 * Unified Typography Tokens
 * iOS HIG scale from design-tokens.css
 */

export const fontFamily = {
  /** iOS: SF Pro. Android: Roboto. Fallback chain for both platforms. */
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Roboto", "Helvetica Neue", sans-serif',
  /** Monospace for code/stats */
  mono: '"SF Mono", "Roboto Mono", "Courier New", monospace',
} as const;

export const fontSizes = {
  caption: 12,
  footnote: 13,
  subhead: 14,
  body: 15,
  callout: 16,
  headline: 17,
  title3: 20,
  title2: 22,
  title1: 28,
  largeTitle: 34,
} as const;

/** Line heights paired 1:1 with fontSizes. */
export const lineHeights = {
  caption: 16,
  footnote: 18,
  subhead: 20,
  body: 22,
  callout: 22,
  headline: 22,
  title3: 26,
  title2: 28,
  title1: 34,
  largeTitle: 41,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Letter spacing (tracking) per iOS HIG.
 * Values in px — Tailwind converts to em in the config.
 */
export const letterSpacing = {
  tight: -0.4,
  normal: 0,
  wide: 0.5,
  wider: 1,
} as const;

export const typography = {
  largeTitle: {
    fontSize: fontSizes.largeTitle,
    lineHeight: lineHeights.largeTitle,
    fontWeight: fontWeights.bold,
  },
  title1: {
    fontSize: fontSizes.title1,
    lineHeight: lineHeights.title1,
    fontWeight: fontWeights.bold,
  },
  title2: {
    fontSize: fontSizes.title2,
    lineHeight: lineHeights.title2,
    fontWeight: fontWeights.bold,
  },
  title3: {
    fontSize: fontSizes.title3,
    lineHeight: lineHeights.title3,
    fontWeight: fontWeights.semibold,
  },
  headline: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.semibold,
  },
  body: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.regular,
  },
  callout: {
    fontSize: fontSizes.callout,
    lineHeight: lineHeights.callout,
    fontWeight: fontWeights.regular,
  },
  subhead: {
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.regular,
  },
  footnote: {
    fontSize: fontSizes.footnote,
    lineHeight: lineHeights.footnote,
    fontWeight: fontWeights.regular,
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    fontWeight: fontWeights.regular,
  },
} as const;

export type TypographyVariant = keyof typeof typography;
