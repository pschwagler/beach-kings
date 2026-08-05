/**
 * Drift guard: lightVars and darkVars must define the same set of CSS-var keys.
 *
 * If anyone adds a key to one without the other, the var bag for that theme
 * will resolve undefined → broken rendering. This test fails fast in CI.
 *
 * Lives under apps/mobile/__tests__ because packages/shared has no Jest
 * setup; mobile's moduleNameMapper resolves the shared imports.
 */

import {
  lightVars,
  darkVars,
  lightPalette,
  darkPalette,
  SEMANTIC_ROLES,
  CANONICAL_CONTRAST_PAIRS,
  cssVarName,
  tailwindClassName,
} from '@beach-kings/shared/tokens';

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const canonicalContrastCases = (
  [
    ['light', lightPalette],
    ['dark', darkPalette],
  ] as const
).flatMap(([theme, palette]) =>
  CANONICAL_CONTRAST_PAIRS.map(({ foreground, background }) => [
    theme,
    foreground,
    background,
    palette[foreground],
    palette[background],
  ] as const),
);

describe('semantic theme tokens', () => {
  it('lightVars and darkVars share identical key sets', () => {
    const lightKeys = Object.keys(lightVars).sort();
    const darkKeys = Object.keys(darkVars).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  it('lightPalette and darkPalette share identical key sets', () => {
    const lightKeys = Object.keys(lightPalette).sort();
    const darkKeys = Object.keys(darkPalette).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  it('every role appears in lightVars / darkVars under its CSS-var name', () => {
    for (const role of SEMANTIC_ROLES) {
      const cssVar = cssVarName(role);
      expect(lightVars[cssVar]).toBeDefined();
      expect(darkVars[cssVar]).toBeDefined();
    }
  });

  it('every var value is a space-separated rgb triple ("r g b")', () => {
    const triple = /^\d{1,3} \d{1,3} \d{1,3}$/;
    for (const [key, value] of Object.entries(lightVars)) {
      expect(value).toMatch(triple);
      expect(key.startsWith('--')).toBe(true);
    }
    for (const value of Object.values(darkVars)) {
      expect(value).toMatch(triple);
    }
  });

  it('every palette value is a 6-digit hex string', () => {
    const hex = /^#[0-9a-fA-F]{6}$/;
    for (const value of Object.values(lightPalette)) {
      expect(value).toMatch(hex);
    }
    for (const value of Object.values(darkPalette)) {
      expect(value).toMatch(hex);
    }
  });

  it('migration-target Tailwind class basenames are stable', () => {
    expect(tailwindClassName('bgSurface')).toBe('surface');
    expect(tailwindClassName('bgPage')).toBe('page');
    expect(tailwindClassName('bgElevated')).toBe('elevated');
    expect(tailwindClassName('textDefault')).toBe('default');
    expect(tailwindClassName('textMuted')).toBe('muted');
    expect(tailwindClassName('textTertiary')).toBe('tertiary');
    expect(tailwindClassName('textAccent')).toBe('accent');
    expect(tailwindClassName('borderDivider')).toBe('divider');
    expect(tailwindClassName('borderStrong')).toBe('strong');
    expect(tailwindClassName('brandTeal')).toBe('brand-teal');
    expect(tailwindClassName('onBrandTeal')).toBe('on-brand-teal');
    expect(tailwindClassName('onBrandGold')).toBe('on-brand-gold');
    expect(tailwindClassName('onDanger')).toBe('on-danger');
    expect(tailwindClassName('successFill')).toBe('success-fill');
    expect(tailwindClassName('successTint')).toBe('success-tint');
    expect(tailwindClassName('success')).toBe('success');
  });

  it('defines each canonical contrast pair only once', () => {
    const pairKeys = CANONICAL_CONTRAST_PAIRS.map(
      ({ foreground, background }) => `${foreground}/${background}`,
    );
    expect(new Set(pairKeys).size).toBe(pairKeys.length);
  });

  it.each(canonicalContrastCases)(
    '%s %s on %s meets WCAG AA',
    (_, _foregroundRole, _backgroundRole, foreground, background) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
