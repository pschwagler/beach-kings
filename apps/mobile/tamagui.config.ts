import { createTamagui, createTokens } from 'tamagui';
import { shorthands } from '@tamagui/shorthands';
import { tokens as sharedTokens, fontFamily, fontSizes, fontWeights } from '@beach-kings/shared';

// Create Tamagui tokens from shared design tokens
const tokens = createTokens({
  color: {
    // Primary palette
    primary: sharedTokens.colors.primary,
    primaryLight: sharedTokens.colors.primaryLight,
    primaryLighter: sharedTokens.colors.primaryLighter,
    primaryDark: sharedTokens.colors.primaryDark,
    primaryDarker: sharedTokens.colors.primaryDarker,

    // Sunset/Coral
    sunsetDark: sharedTokens.colors.sunsetDark,
    sunsetLight: sharedTokens.colors.sunsetLight,
    sunsetOrange: sharedTokens.colors.sunsetOrange,
    coral: sharedTokens.colors.coral,
    coralLight: sharedTokens.colors.coralLight,
    coralDark: sharedTokens.colors.coralDark,
    mutedRed: sharedTokens.colors.mutedRed,

    // Sand/Warm
    sand: sharedTokens.colors.sand,
    sandLight: sharedTokens.colors.sandLight,
    sandDark: sharedTokens.colors.sandDark,
    warmBrown: sharedTokens.colors.warmBrown,
    warmBrownLight: sharedTokens.colors.warmBrownLight,
    warmBrownDark: sharedTokens.colors.warmBrownDark,

    // Ocean/Seafoam
    deepOcean: sharedTokens.colors.deepOcean,
    oceanBlue: sharedTokens.colors.oceanBlue,
    lightBlue: sharedTokens.colors.lightBlue,
    seafoam: sharedTokens.colors.seafoam,
    seafoamLight: sharedTokens.colors.seafoamLight,
    seafoamDark: sharedTokens.colors.seafoamDark,
    oceanGray: sharedTokens.colors.oceanGray,
    oceanGrayLight: sharedTokens.colors.oceanGrayLight,
    oceanGrayDark: sharedTokens.colors.oceanGrayDark,
    oceanGrayDarker: sharedTokens.colors.oceanGrayDarker,

    // Gold
    sunGold: sharedTokens.colors.sunGold,
    sunGoldLight: sharedTokens.colors.sunGoldLight,
    sunGoldDark: sharedTokens.colors.sunGoldDark,
    goldText: sharedTokens.colors.goldText,
    goldDark: sharedTokens.colors.goldDark,

    // Dusk/Purple
    duskPurple: sharedTokens.colors.duskPurple,
    duskPurpleLight: sharedTokens.colors.duskPurpleLight,
    duskPurpleDark: sharedTokens.colors.duskPurpleDark,

    // Navy
    navyLogoBg: sharedTokens.colors.navyLogoBg,

    // Grays
    gray50: sharedTokens.colors.gray50,
    gray100: sharedTokens.colors.gray100,
    gray200: sharedTokens.colors.gray200,
    gray300: sharedTokens.colors.gray300,
    gray600: sharedTokens.colors.gray600,
    gray700: sharedTokens.colors.gray700,
    gray900: sharedTokens.colors.gray900,

    // Functional
    success: sharedTokens.colors.success,
    successDark: sharedTokens.colors.successDark,
    successLight: sharedTokens.colors.successLight,
    danger: sharedTokens.colors.danger,
    dangerLight: sharedTokens.colors.dangerLight,
    error: sharedTokens.colors.error,
    warning: sharedTokens.colors.warning,
    info: sharedTokens.colors.info,

    // Text
    textPrimary: sharedTokens.colors.textPrimary,
    textSecondary: sharedTokens.colors.textSecondary,
    textLight: sharedTokens.colors.textLight,
    textWhite: sharedTokens.colors.textWhite,

    // Backgrounds
    background: sharedTokens.colors.background,
    backgroundLight: sharedTokens.colors.backgroundLight,
    backgroundDark: sharedTokens.colors.backgroundDark,
    cream: sharedTokens.colors.cream,

    // Borders
    border: sharedTokens.colors.border,
    borderLight: sharedTokens.colors.borderLight,

    // Shadow
    shadow: sharedTokens.colors.shadow,

    // Default Tamagui colors for components
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
  },
  space: {
    xs: sharedTokens.spacing.xs,
    sm: sharedTokens.spacing.sm,
    md: sharedTokens.spacing.md,
    lg: sharedTokens.spacing.lg,
    xl: sharedTokens.spacing.xl,
    xxl: sharedTokens.spacing.xxl,
    true: sharedTokens.spacing.md, // Default size
  },
  size: {
    // Named size tokens (for spacing/sizing)
    xs: sharedTokens.spacing.xs,
    sm: sharedTokens.spacing.sm,
    md: sharedTokens.spacing.md,
    lg: sharedTokens.spacing.lg,
    xl: sharedTokens.spacing.xl,
    xxl: sharedTokens.spacing.xxl,
    true: sharedTokens.spacing.md, // Default size
    
    // Numeric size tokens (for font sizes - must match font.size keys)
    1: fontSizes.xs,      // 12px
    2: fontSizes.sm,      // 14px
    3: fontSizes.base,    // 16px
    4: fontSizes.lg,      // 18px
    5: fontSizes.xl,      // 20px
    6: fontSizes['2xl'],  // 24px
    7: fontSizes['3xl'],  // 28px
    8: fontSizes['4xl'],  // 32px
    9: fontSizes['5xl'],  // 40px
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    round: 9999,
  },
  zIndex: {
    xs: 0,
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4,
    xxl: 5,
    true: 2, // Default zIndex (md)
  },
});

// Create font configuration
const fonts = {
  heading: {
    family: fontFamily.default,
    size: {
      1: fontSizes.xs,
      2: fontSizes.sm,
      3: fontSizes.base,
      4: fontSizes.lg,
      5: fontSizes.xl,
      6: fontSizes['2xl'],
      7: fontSizes['3xl'],
      8: fontSizes['4xl'],
      9: fontSizes['5xl'],
    },
    weight: {
      1: fontWeights.normal,
      2: fontWeights.medium,
      3: fontWeights.semibold,
      4: fontWeights.bold,
    },
    lineHeight: {
      1: 16,
      2: 20,
      3: 24,
      4: 28,
      5: 32,
      6: 40,
    },
  },
  body: {
    family: fontFamily.default,
    size: {
      1: fontSizes.xs,
      2: fontSizes.sm,
      3: fontSizes.base,
      4: fontSizes.lg,
      5: fontSizes.xl,
    },
    weight: {
      1: fontWeights.normal,
      2: fontWeights.medium,
      3: fontWeights.semibold,
      4: fontWeights.bold,
    },
    lineHeight: {
      1: 16,
      2: 20,
      3: 24,
      4: 28,
    },
  },
};

// Create themes
const themes = {
  light: {
    background: tokens.color.background,
    backgroundHover: tokens.color.backgroundLight,
    backgroundPress: tokens.color.backgroundDark,
    backgroundFocus: tokens.color.backgroundLight,
    color: tokens.color.textPrimary,
    colorHover: tokens.color.textSecondary,
    colorPress: tokens.color.textPrimary,
    colorFocus: tokens.color.textPrimary,
    borderColor: tokens.color.border,
    borderColorHover: tokens.color.borderLight,
    borderColorPress: tokens.color.border,
    borderColorFocus: tokens.color.borderLight,
    placeholderColor: tokens.color.textLight,
    // Add text colors as direct theme properties for easier access
    textPrimary: tokens.color.textPrimary,
    textSecondary: tokens.color.textSecondary,
    textLight: tokens.color.textLight,
    textWhite: tokens.color.textWhite,
  },
};

// Create Tamagui config
const config = createTamagui({
  tokens,
  themes,
  fonts,
  shorthands,
  animations: {
    bouncy: {
      type: 'spring',
      damping: 10,
      mass: 0.9,
      stiffness: 100,
    },
    lazy: {
      type: 'spring',
      damping: 20,
      stiffness: 60,
    },
    quick: {
      type: 'spring',
      damping: 20,
      mass: 1.2,
      stiffness: 250,
    },
  },
});

// Add debugging (only in development, and only log once)
if (__DEV__ && !(global as any).__TAMAGUI_CONFIG_LOGGED) {
  (global as any).__TAMAGUI_CONFIG_LOGGED = true;
  console.log('[Tamagui Config] ✅ Configuration loaded successfully');
  console.log('[Tamagui Config] Fonts:', Object.keys(fonts).join(', '));
  console.log('[Tamagui Config] Body font sizes available:', Object.keys(fonts.body.size).map(k => `$${k}`).join(', '));
  console.log('[Tamagui Config] Color tokens:', Object.keys(tokens.color).length, 'available');
  console.log('[Tamagui Config] Token examples - textPrimary:', tokens.color.textPrimary.val, 'textLight:', tokens.color.textLight.val);
}

export type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;


