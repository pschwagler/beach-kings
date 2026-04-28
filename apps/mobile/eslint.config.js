const tsParser = require('@typescript-eslint/parser');

/**
 * Semantic token enforcement for NativeWind v4.
 *
 * Flags dark: color variants — dark:bg-*, dark:text-*, dark:border-<word> —
 * that bypass the CSS-var-backed semantic token system. Components must use
 * theme-flipping classes (bg-surface, text-default, border-strong) instead.
 *
 * Structural dark: variants are intentionally NOT flagged:
 *   dark:border / dark:border-b/t/l/r  — border-width / direction toggles
 *   dark:shadow-none                    — shadow toggle
 *   dark:flex, dark:hidden, etc.        — layout / display variants
 */
const darkColorRule = [
  'warn',
  {
    selector:
      'JSXAttribute[name.name="className"] Literal[value=/dark:(bg|text)-/]',
    message:
      'Use a semantic token (e.g. bg-surface, text-default) instead of dark: color variants. See apps/mobile/docs/theming.md.',
  },
  {
    selector:
      'JSXAttribute[name.name="className"] TemplateElement[value.raw=/dark:(bg|text)-/]',
    message:
      'Use a semantic token (e.g. bg-surface, text-default) instead of dark: color variants. See apps/mobile/docs/theming.md.',
  },
  {
    // dark:border-<2+ chars> catches border-color names; skips single-char
    // directionals (b, t, l, r, x, y) which are structural.
    selector:
      'JSXAttribute[name.name="className"] Literal[value=/dark:border-[a-z]{2,}/]',
    message:
      'Use a semantic token (e.g. border-strong, border-divider) instead of dark: border-color variants. See apps/mobile/docs/theming.md.',
  },
  {
    selector:
      'JSXAttribute[name.name="className"] TemplateElement[value.raw=/dark:border-[a-z]{2,}/]',
    message:
      'Use a semantic token (e.g. border-strong, border-divider) instead of dark: border-color variants. See apps/mobile/docs/theming.md.',
  },
];

module.exports = [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.expo/**'],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-restricted-syntax': darkColorRule,
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
