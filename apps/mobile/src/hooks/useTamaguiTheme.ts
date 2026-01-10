/**
 * Hook to access Tamagui design tokens for React Native StyleSheet
 * Provides easy access to colors, spacing, typography, and other design tokens
 */

import { useTheme, getTokens } from 'tamagui';

export function useTamaguiTheme() {
  const theme = useTheme();
  const tokens = getTokens();

  return {
    // Colors - access via theme or tokens
    colors: {
      // Primary palette
      primary: tokens.color.primary.val,
      primaryLight: tokens.color.primaryLight.val,
      primaryLighter: tokens.color.primaryLighter.val,
      primaryDark: tokens.color.primaryDark.val,
      primaryDarker: tokens.color.primaryDarker.val,

      // Sunset/Coral
      sunsetDark: tokens.color.sunsetDark.val,
      sunsetLight: tokens.color.sunsetLight.val,
      sunsetOrange: tokens.color.sunsetOrange.val,
      coral: tokens.color.coral.val,
      coralLight: tokens.color.coralLight.val,
      coralDark: tokens.color.coralDark.val,
      mutedRed: tokens.color.mutedRed.val,

      // Sand/Warm
      sand: tokens.color.sand.val,
      sandLight: tokens.color.sandLight.val,
      sandDark: tokens.color.sandDark.val,
      warmBrown: tokens.color.warmBrown.val,
      warmBrownLight: tokens.color.warmBrownLight.val,
      warmBrownDark: tokens.color.warmBrownDark.val,

      // Ocean/Seafoam
      deepOcean: tokens.color.deepOcean.val,
      oceanBlue: tokens.color.oceanBlue.val,
      lightBlue: tokens.color.lightBlue.val,
      seafoam: tokens.color.seafoam.val,
      seafoamLight: tokens.color.seafoamLight.val,
      seafoamDark: tokens.color.seafoamDark.val,
      oceanGray: tokens.color.oceanGray.val,
      oceanGrayLight: tokens.color.oceanGrayLight.val,
      oceanGrayDark: tokens.color.oceanGrayDark.val,
      oceanGrayDarker: tokens.color.oceanGrayDarker.val,

      // Gold
      sunGold: tokens.color.sunGold.val,
      sunGoldLight: tokens.color.sunGoldLight.val,
      sunGoldDark: tokens.color.sunGoldDark.val,
      goldText: tokens.color.goldText.val,
      goldDark: tokens.color.goldDark.val,

      // Dusk/Purple
      duskPurple: tokens.color.duskPurple.val,
      duskPurpleLight: tokens.color.duskPurpleLight.val,
      duskPurpleDark: tokens.color.duskPurpleDark.val,

      // Navy
      navyLogoBg: tokens.color.navyLogoBg.val,

      // Grays
      gray50: tokens.color.gray50.val,
      gray100: tokens.color.gray100.val,
      gray200: tokens.color.gray200.val,
      gray300: tokens.color.gray300.val,
      gray600: tokens.color.gray600.val,
      gray700: tokens.color.gray700.val,
      gray900: tokens.color.gray900.val,

      // Functional
      success: tokens.color.success.val,
      successDark: tokens.color.successDark.val,
      successLight: tokens.color.successLight.val,
      danger: tokens.color.danger.val,
      dangerLight: tokens.color.dangerLight.val,
      error: tokens.color.error.val,
      warning: tokens.color.warning.val,
      info: tokens.color.info.val,

      // Text
      textPrimary: tokens.color.textPrimary.val,
      textSecondary: tokens.color.textSecondary.val,
      textLight: tokens.color.textLight.val,
      textWhite: tokens.color.textWhite.val,

      // Backgrounds
      background: tokens.color.background.val,
      backgroundLight: tokens.color.backgroundLight.val,
      backgroundDark: tokens.color.backgroundDark.val,
      cream: tokens.color.cream.val,

      // Borders
      border: tokens.color.border.val,
      borderLight: tokens.color.borderLight.val,

      // Shadow
      shadow: tokens.color.shadow.val,

      // Defaults
      white: tokens.color.white.val,
      black: tokens.color.black.val,
      transparent: tokens.color.transparent.val,
    },

    // Spacing
    spacing: {
      xs: tokens.space.xs.val,
      sm: tokens.space.sm.val,
      md: tokens.space.md.val,
      lg: tokens.space.lg.val,
      xl: tokens.space.xl.val,
      xxl: tokens.space.xxl.val,
    },

    // Size (same as spacing for now)
    size: {
      xs: tokens.size.xs.val,
      sm: tokens.size.sm.val,
      md: tokens.size.md.val,
      lg: tokens.size.lg.val,
      xl: tokens.size.xl.val,
      xxl: tokens.size.xxl.val,
    },

    // Border radius
    radius: {
      xs: tokens.radius.xs.val,
      sm: tokens.radius.sm.val,
      md: tokens.radius.md.val,
      lg: tokens.radius.lg.val,
      xl: tokens.radius.xl.val,
      round: tokens.radius.round.val,
    },

    // Z-index
    zIndex: {
      xs: tokens.zIndex.xs.val,
      sm: tokens.zIndex.sm.val,
      md: tokens.zIndex.md.val,
      lg: tokens.zIndex.lg.val,
      xl: tokens.zIndex.xl.val,
      xxl: tokens.zIndex.xxl.val,
    },

    // Typography - from shared tokens
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      '2xl': 24,
      '3xl': 30,
      '4xl': 36,
      '5xl': 48,
    },

    fontWeight: {
      normal: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },

    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  };
}

