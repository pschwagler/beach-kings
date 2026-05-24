/**
 * Semantic theme tokens for the mobile app.
 *
 * One name per visual role. Both palettes share identical keys; values flip
 * per theme. Tailwind classes resolve through CSS variables emitted by
 * NativeWind's vars() helper at the ThemeProvider root.
 *
 * - lightVars / darkVars: kebab-case CSS-var keys, space-separated rgb triples
 *   ("255 255 255") so Tailwind's `<alpha-value>` placeholder works.
 * - lightPalette / darkPalette: camelCase keys, hex strings — for the ~11
 *   components that bypass Tailwind and consume colors as JS values
 *   (read via `usePaletteColors`).
 *
 * Source of truth lives in `colors.ts` / `darkColors.ts`. Adding a role here
 * is a two-step edit (definition + hex pair); the drift guard test ensures
 * both palettes stay key-aligned.
 */

import { colors, darkColors } from './colors';

type ThemeHexPair = readonly [light: string, dark: string];

/**
 * Master role table. Each entry = camelCase role → [light hex, dark hex].
 * All other shapes (CSS vars, Tailwind class names, JS palettes) are derived.
 */
const roles = {
  // Surfaces
  bgPage: [colors.bgPrimary, darkColors.bgBase],
  bgSurface: [colors.bgSurface, darkColors.bgSurface],
  bgElevated: [colors.bgSurface, darkColors.bgElevated],
  bgInset: [colors.bgPrimary, darkColors.bgInset],
  bgNav: [colors.bgNav, darkColors.bgNav],
  bgTabbar: [colors.bgSurface, darkColors.bgTabbar],

  // Text
  textDefault: [colors.textPrimary, darkColors.textPrimary],
  textMuted: [colors.textSecondary, darkColors.textSecondary],
  textTertiary: [colors.textTertiary, darkColors.textTertiary],
  textInverse: [colors.textInverse, colors.textPrimary],

  // Borders
  borderStrong: [colors.border, darkColors.border],
  borderDivider: [colors.border, darkColors.borderSubtle],

  // Brand (intentionally flips per theme — light mode uses the deeper teal
  // for contrast on white; dark mode uses a lifted teal that reads on #161b22)
  brandTeal: [colors.primary, darkColors.brandTeal],
  brandGold: [colors.accent, darkColors.brandGold],

  // Status text colors
  success: [colors.success, darkColors.successText],
  danger: [colors.danger, darkColors.dangerText],
  warning: [colors.warning, darkColors.warningText],
  info: [colors.info, darkColors.infoText],
  // "Live / in-progress" — warm amber. Distinct from success (completed) and
  // warning (problem). Used on session "Active" badges, live-event chips, etc.
  statusLive: ['#b87900', '#f4c060'],

  // Status tinted-surface colors (chip / row background pairs)
  successTint: [colors.successTint, darkColors.successBg],
  dangerTint: [colors.dangerTint, darkColors.dangerBg],
  warningTint: [colors.warningTint, darkColors.warningBg],
  infoTint: [colors.infoTint, darkColors.infoBg],
  statusLiveTint: ['#fff1d6', '#3a2a14'],
} as const satisfies Record<string, ThemeHexPair>;

export type SemanticRole = keyof typeof roles;

/**
 * camelCase → kebab-case ("bgSurface" → "bg-surface").
 * Pure helper, no allocations beyond the returned string.
 */
function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * "#161b22" → "22 27 34". Throws on malformed input so the build catches it.
 */
function hexToRgbTriple(hex: string): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6 || /[^0-9a-f]/i.test(cleaned)) {
    throw new Error(`semantic tokens: expected 6-char hex, got "${hex}"`);
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export const SEMANTIC_ROLES: readonly SemanticRole[] = Object.keys(roles) as SemanticRole[];

/**
 * CSS variable name for a role: `bgSurface` → `--bg-surface`.
 */
export function cssVarName(role: SemanticRole): `--${string}` {
  return `--${camelToKebab(role)}` as `--${string}`;
}

/**
 * Tailwind color-key for the role. Tailwind generates `bg-X`, `text-X`,
 * and `border-X` utilities for every color key, so we strip the leading
 * category prefix to get the migration-target class names:
 *
 *   bgSurface     → "surface"     ⇒ `bg-surface`
 *   textDefault   → "default"     ⇒ `text-default`
 *   borderDivider → "divider"     ⇒ `border-divider`
 *   borderStrong  → "strong"      ⇒ `border-strong`
 *   brandTeal     → "brand-teal"  ⇒ `bg-brand-teal`, `text-brand-teal`
 *   successTint   → "success-tint"⇒ `bg-success-tint`
 *   success       → "success"     ⇒ `text-success`, `bg-success`
 */
export function tailwindClassName(role: SemanticRole): string {
  const kebab = camelToKebab(role);
  if (kebab.startsWith('bg-')) return kebab.slice(3);
  if (kebab.startsWith('text-')) return kebab.slice(5);
  if (kebab.startsWith('border-')) return kebab.slice(7);
  return kebab;
}

function buildVarMap(side: 0 | 1): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of SEMANTIC_ROLES) {
    out[cssVarName(role)] = hexToRgbTriple(roles[role][side]);
  }
  return out;
}

function buildPalette(side: 0 | 1): Record<SemanticRole, string> {
  const out = {} as Record<SemanticRole, string>;
  for (const role of SEMANTIC_ROLES) {
    out[role] = roles[role][side];
  }
  return out;
}

/** Light-mode CSS variables, keyed by kebab CSS-var name. */
export const lightVars: Readonly<Record<string, string>> = buildVarMap(0);

/** Dark-mode CSS variables, keyed by kebab CSS-var name. */
export const darkVars: Readonly<Record<string, string>> = buildVarMap(1);

/** Light-mode hex palette for direct JS consumers (no Tailwind path). */
export const lightPalette: Readonly<Record<SemanticRole, string>> = buildPalette(0);

/** Dark-mode hex palette for direct JS consumers (no Tailwind path). */
export const darkPalette: Readonly<Record<SemanticRole, string>> = buildPalette(1);
