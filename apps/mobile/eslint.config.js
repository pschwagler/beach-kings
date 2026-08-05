const tsParser = require('@typescript-eslint/parser');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

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
    // TypeScript parser + React plugins apply to every TS/TSX file —
    // app code, hooks, tests, and root config files (e.g. tailwind.config.ts).
    // Scoping the parser too narrowly is what previously left test and config
    // files on the default parser, which choked on TS syntax.
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-array-index-key': 'warn',
      // react-native's built-in SafeAreaView is deprecated AND is not registered
      // with NativeWind's className interop, so `flex-1` is silently dropped and
      // layout collapses (this caused the empty Write Review modal body). Always
      // import SafeAreaView from react-native-safe-area-context instead.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['SafeAreaView'],
              message:
                "Import SafeAreaView from 'react-native-safe-area-context' — react-native's is deprecated and breaks NativeWind flex layout.",
            },
            {
              name: 'react-native',
              importNames: ['Text'],
              message:
                "Render shipped copy through the shared AppText primitive so typography, scaling, and font-family behavior stay centralized.",
            },
          ],
        },
      ],
    },
  },
  {
    // Semantic-token enforcement only applies to shipped UI under app/ and src/.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': darkColorRule,
    },
  },
  {
    files: ['src/components/ui/AppText.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
];
