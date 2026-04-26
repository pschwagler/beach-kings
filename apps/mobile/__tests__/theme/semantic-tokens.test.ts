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
  cssVarName,
  tailwindClassName,
} from '@beach-kings/shared/tokens';

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
    expect(tailwindClassName('borderDivider')).toBe('divider');
    expect(tailwindClassName('borderStrong')).toBe('strong');
    expect(tailwindClassName('brandTeal')).toBe('brand-teal');
    expect(tailwindClassName('successTint')).toBe('success-tint');
    expect(tailwindClassName('success')).toBe('success');
  });
});
