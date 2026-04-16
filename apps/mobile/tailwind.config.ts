import type { Config } from 'tailwindcss';
import {
  colors,
  darkColors,
  spacing,
  layout,
  fontFamily,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
  shadows,
  darkShadows,
  opacity,
  duration,
  zIndex,
} from '@beach-kings/shared/tokens';

/**
 * Tailwind config wired to shared design tokens.
 * NativeWind v4 consumes this at build time.
 *
 * Dark mode strategy: `darkMode: 'class'` — ThemeProvider applies
 * `dark` className to root View. Components use `dark:bg-X` pairs.
 *
 * Every visual decision should flow from tokens. If you find yourself
 * reaching for a raw value, add a token first.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      /* ── Colors ─────────────────────────────────────────────── */
      colors: {
        // Brand
        primary: {
          DEFAULT: colors.primary,
          light: colors.primaryLight,
        },
        accent: {
          DEFAULT: colors.accent,
          light: colors.accentLight,
        },

        // Semantic
        success: colors.success,
        danger: colors.danger,
        warning: colors.warning,
        info: colors.info,

        // Semantic tinted backgrounds (chips, badges, highlight rows)
        'teal-tint': colors.tealTint,
        'gold-tint': colors.goldTint,
        'success-tint': colors.successTint,
        'danger-tint': colors.dangerTint,
        'warning-tint': colors.warningTint,
        'info-tint': colors.infoTint,

        // Disabled state
        'disabled-bg': colors.disabledBg,
        'disabled-text': colors.disabledText,

        // Light surfaces
        surface: colors.bgSurface,
        'dark-surface': darkColors.bgSurface,
        nav: colors.bgNav,
        border: colors.border,

        // Light semantic aliases
        'bg-page': colors.bgPrimary,
        'text-default': colors.textPrimary,

        // Gray scale (full)
        gray: {
          50: colors.gray50,
          100: colors.gray100,
          200: colors.gray200,
          300: colors.gray300,
          400: colors.gray400,
          500: colors.gray500,
          600: colors.gray600,
          700: colors.gray700,
          800: colors.gray800,
          900: colors.gray900,
        },

        // Dark surfaces (three-tier hierarchy)
        base: darkColors.bgBase,
        elevated: darkColors.bgElevated,
        inset: darkColors.bgInset,
        tabbar: darkColors.bgTabbar,
        'nav-dark': darkColors.bgNav,

        // Dark text
        'content-primary': darkColors.textPrimary,
        'content-secondary': darkColors.textSecondary,
        'content-tertiary': darkColors.textTertiary,

        // Dark brand (lightened for dark backgrounds)
        'brand-teal': darkColors.brandTeal,
        'brand-gold': darkColors.brandGold,

        // Dark borders
        'border-strong': darkColors.border,
        'border-subtle': darkColors.borderSubtle,

        // Dark semantic pairs
        'success-bg': darkColors.successBg,
        'success-text': darkColors.successText,
        'danger-bg': darkColors.dangerBg,
        'danger-text': darkColors.dangerText,
        'warning-bg': darkColors.warningBg,
        'warning-text': darkColors.warningText,
        'info-bg': darkColors.infoBg,
        'info-text': darkColors.infoText,
      },

      /* ── Typography ─────────────────────────────────────────── */
      fontFamily: {
        sans: fontFamily.sans,
        mono: fontFamily.mono,
      },
      fontSize: {
        caption: [`${fontSizes.caption}px`, { lineHeight: `${lineHeights.caption}px` }],
        footnote: [`${fontSizes.footnote}px`, { lineHeight: `${lineHeights.footnote}px` }],
        subhead: [`${fontSizes.subhead}px`, { lineHeight: `${lineHeights.subhead}px` }],
        body: [`${fontSizes.body}px`, { lineHeight: `${lineHeights.body}px` }],
        callout: [`${fontSizes.callout}px`, { lineHeight: `${lineHeights.callout}px` }],
        headline: [`${fontSizes.headline}px`, { lineHeight: `${lineHeights.headline}px` }],
        title3: [`${fontSizes.title3}px`, { lineHeight: `${lineHeights.title3}px` }],
        title2: [`${fontSizes.title2}px`, { lineHeight: `${lineHeights.title2}px` }],
        title1: [`${fontSizes.title1}px`, { lineHeight: `${lineHeights.title1}px` }],
        'large-title': [`${fontSizes.largeTitle}px`, { lineHeight: `${lineHeights.largeTitle}px` }],
      },
      fontWeight: {
        regular: fontWeights.regular,
        medium: fontWeights.medium,
        semibold: fontWeights.semibold,
        bold: fontWeights.bold,
      },
      letterSpacing: {
        tight: `${letterSpacing.tight}px`,
        normal: `${letterSpacing.normal}px`,
        wide: `${letterSpacing.wide}px`,
        wider: `${letterSpacing.wider}px`,
      },

      /* ── Spacing ────────────────────────────────────────────── */
      spacing: {
        xxs: `${spacing.xxs}px`,
        xs: `${spacing.xs}px`,
        sm: `${spacing.sm}px`,
        md: `${spacing.md}px`,
        lg: `${spacing.lg}px`,
        xl: `${spacing.xl}px`,
        xxl: `${spacing.xxl}px`,
        xxxl: `${spacing.xxxl}px`,
      },

      /* ── Border Radius ──────────────────────────────────────── */
      borderRadius: {
        card: `${layout.radiusCard}px`,
        button: `${layout.radiusButton}px`,
        modal: `${layout.radiusModal}px`,
        chip: `${layout.radiusChip}px`,
        pill: `${layout.radiusPill}px`,
        input: `${layout.radiusInput}px`,
        full: `${layout.radiusFull}px`,
      },

      /* ── Shadows ────────────────────────────────────────────── */
      boxShadow: {
        card: shadows.card,
        elevated: shadows.elevated,
        nav: shadows.nav,
        none: shadows.none,
        'dark-card': darkShadows.card,
        'dark-elevated': darkShadows.elevated,
      },

      /* ── Layout (touch targets, fixed dimensions) ───────────── */
      minHeight: {
        touch: `${layout.touchTargetMin}px`,
      },
      minWidth: {
        touch: `${layout.touchTargetMin}px`,
      },
      height: {
        'nav-bar': `${layout.navBarHeight}px`,
        'tab-bar': `${layout.tabBarHeight}px`,
        'icon-btn': `${layout.iconBtnSize}px`,
        'icon-visual': `${layout.iconVisualSize}px`,
      },
      width: {
        'icon-btn': `${layout.iconBtnSize}px`,
        'icon-visual': `${layout.iconVisualSize}px`,
      },
      padding: {
        'content-inset': `${layout.contentInset}px`,
        'card-inner': `${layout.cardPadding}px`,
      },

      /* ── Opacity ────────────────────────────────────────────── */
      opacity: {
        disabled: `${opacity.disabled}`,
        pressed: `${opacity.pressed}`,
        overlay: `${opacity.overlay}`,
        translucent: `${opacity.translucent}`,
        hover: `${opacity.hover}`,
      },

      /* ── Z-Index ────────────────────────────────────────────── */
      zIndex: {
        base: `${zIndex.base}`,
        sticky: `${zIndex.sticky}`,
        nav: `${zIndex.nav}`,
        dropdown: `${zIndex.dropdown}`,
        modal: `${zIndex.modal}`,
        sheet: `${zIndex.sheet}`,
        toast: `${zIndex.toast}`,
        tooltip: `${zIndex.tooltip}`,
      },

      /* ── Animation ──────────────────────────────────────────── */
      transitionDuration: {
        fast: `${duration.fast}ms`,
        normal: `${duration.normal}ms`,
        slow: `${duration.slow}ms`,
        slower: `${duration.slower}ms`,
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        in: 'cubic-bezier(0.55, 0.06, 0.68, 0.19)',
        'in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
        spring: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
