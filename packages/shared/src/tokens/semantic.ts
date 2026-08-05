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
  textInverse: [colors.textInverse, colors.textInverse],
  // Brand gold is intentionally brighter than AA allows as foreground text
  // on light surfaces. Keep brandGold for fills and decorative marks; use
  // this deeper role anywhere gold carries readable content.
  textAccent: ['#765800', darkColors.brandGold],

  // Borders
  borderStrong: [colors.border, darkColors.border],
  borderDivider: [colors.border, darkColors.borderSubtle],

  // Brand (intentionally flips per theme — light mode uses the deeper teal
  // for contrast on warm white; dark mode uses a lifted teal that reads on
  // the deep teal surface)
  brandTeal: [colors.primary, darkColors.brandTeal],
  brandGold: [colors.accent, darkColors.brandGold],

  // Foregrounds for filled controls. These are intentionally separate from
  // textInverse: a lifted brand fill in dark mode needs a dark foreground,
  // while navigation and other dark surfaces continue to use textInverse.
  onBrandTeal: [colors.textInverse, darkColors.bgBase],
  onBrandGold: [colors.textPrimary, darkColors.bgBase],
  onDanger: [colors.textInverse, darkColors.bgBase],
  onSuccess: [darkColors.bgBase, darkColors.bgBase],
  onWarning: [darkColors.bgBase, darkColors.bgBase],
  onInfo: [darkColors.bgBase, darkColors.bgBase],
  onStatusLive: [darkColors.bgBase, darkColors.bgBase],

  // Status text colors
  success: ['#166534', darkColors.successText],
  danger: [colors.danger, darkColors.dangerText],
  warning: ['#854d0e', darkColors.warningText],
  info: ['#1d4ed8', darkColors.infoText],
  // "Live / in-progress" — warm amber. Distinct from success (completed) and
  // warning (problem). Used on session "Active" badges, live-event chips, etc.
  statusLive: ['#92400e', '#f4c060'],

  // Saturated fills/dots retain the sporting palette independently from the
  // darker light-mode text roles above.
  successFill: [colors.success, darkColors.successText],
  dangerFill: [colors.danger, darkColors.dangerFill],
  warningFill: [colors.warning, darkColors.warningText],
  infoFill: [colors.info, darkColors.infoText],
  statusLiveFill: ['#b87900', '#f4c060'],

  // Status tinted-surface colors (chip / row background pairs)
  successTint: [colors.successTint, darkColors.successBg],
  dangerTint: [colors.dangerTint, darkColors.dangerBg],
  warningTint: [colors.warningTint, darkColors.warningBg],
  infoTint: [colors.infoTint, darkColors.infoBg],
  statusLiveTint: ['#fff1d6', '#3a2a14'],
} as const satisfies Record<string, ThemeHexPair>;

export type SemanticRole = keyof typeof roles;

export interface CanonicalContrastPair {
  readonly foreground: SemanticRole;
  readonly background: SemanticRole;
}

const readingSurfaces = [
  'bgPage',
  'bgSurface',
  'bgElevated',
  'bgInset',
] as const satisfies readonly SemanticRole[];

const readingForegrounds = [
  'textDefault',
  'textMuted',
  'textTertiary',
  'brandTeal',
  'textAccent',
  'success',
  'danger',
  'warning',
  'info',
  'statusLive',
] as const satisfies readonly SemanticRole[];

/**
 * Every foreground/background pairing supported by the semantic UI system.
 * Consumers should choose one of these pairs instead of combining roles ad
 * hoc. Tests enforce WCAG AA in both themes for the complete table.
 */
export const CANONICAL_CONTRAST_PAIRS: readonly CanonicalContrastPair[] = [
  ...readingForegrounds.flatMap((foreground) =>
    readingSurfaces.map((background) => ({ foreground, background })),
  ),
  { foreground: 'textInverse', background: 'bgNav' },
  { foreground: 'brandGold', background: 'bgNav' },
  { foreground: 'onBrandTeal', background: 'brandTeal' },
  { foreground: 'onBrandGold', background: 'brandGold' },
  { foreground: 'onDanger', background: 'dangerFill' },
  { foreground: 'onSuccess', background: 'successFill' },
  { foreground: 'onWarning', background: 'warningFill' },
  { foreground: 'onInfo', background: 'infoFill' },
  { foreground: 'onStatusLive', background: 'statusLiveFill' },
  { foreground: 'textDefault', background: 'successTint' },
  { foreground: 'textDefault', background: 'dangerTint' },
  { foreground: 'textDefault', background: 'warningTint' },
  { foreground: 'textDefault', background: 'infoTint' },
  { foreground: 'textDefault', background: 'statusLiveTint' },
  { foreground: 'success', background: 'successTint' },
  { foreground: 'danger', background: 'dangerTint' },
  { foreground: 'warning', background: 'warningTint' },
  { foreground: 'info', background: 'infoTint' },
  { foreground: 'statusLive', background: 'statusLiveTint' },
  { foreground: 'brandTeal', background: 'infoTint' },
  { foreground: 'textAccent', background: 'warningTint' },
];

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
