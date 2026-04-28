# Mobile Theming — Semantic Token System

## Quick reference

| Tailwind class | Role | Light | Dark |
|---|---|---|---|
| `bg-page` | Screen background | `#f2f2f7` | `#0d1117` |
| `bg-surface` | Cards, sheets | `#ffffff` | `#161b22` |
| `bg-elevated` | Inputs, raised cards | `#ffffff` | `#1e2430` |
| `bg-inset` | Recessed areas inside surfaces | `#f2f2f7` | `#0d1117` |
| `bg-nav` | Top navigation bar | `#1a3a4a` | `#161b22` |
| `bg-tabbar` | Bottom tab bar | `#ffffff` | `#161b22` |
| `text-default` | Primary body copy | `#1a1a1a` | `#e6edf3` |
| `text-muted` | Secondary / subdued labels | `#6e6e73` | `#8b949e` |
| `text-tertiary` | Placeholder text, hints | `#8e8e93` | `#6e7681` |
| `text-inverse` | Text on dark backgrounds | `#ffffff` | `#1a1a1a` |
| `border-strong` | Input borders, prominent dividers | `#c6c6c8` | `#30363d` |
| `border-divider` | List separators, subtle lines | `#c6c6c8` | `#21262d` |
| `text-brand-teal` / `bg-brand-teal` | Primary brand color | `#1a3a4a` | `#14b8a6` |
| `text-brand-gold` / `bg-brand-gold` | Secondary brand color | `#d4a843` | `#f59e0b` |
| `text-success` / `bg-success` | Success foreground | `#34c759` | `#3fb950` |
| `text-danger` / `bg-danger` | Danger / error foreground | `#ff3b30` | `#f85149` |
| `text-warning` / `bg-warning` | Warning foreground | `#ff9500` | `#d29922` |
| `text-info` / `bg-info` | Info foreground | `#007aff` | `#58a6ff` |
| `bg-success-tint` | Success chip / row bg | `#e6f9ec` | `#1a3a2a` |
| `bg-danger-tint` | Danger chip / row bg | `#fff0ef` | `#3a1a1a` |
| `bg-warning-tint` | Warning chip / row bg | `#fff8e6` | `#3a2e1a` |
| `bg-info-tint` | Info chip / row bg | `#e6f2ff` | `#1a2a3a` |

## How it works

`ThemeProvider` in `src/contexts/ThemeContext.tsx` mounts a set of CSS custom
properties on the root View when the theme changes. Each semantic role maps to
one CSS variable (e.g. `--surface`, `--text-default`). NativeWind resolves
`bg-surface` to `rgb(var(--surface) / <alpha>)` at compile time, so the actual
color is filled in at runtime from the variable — no re-render required.

Source of truth: `packages/shared/src/tokens/semantic.ts`.

## The golden rule — no `dark:` color variants

Every color in the component must come from a semantic token. Never write:

```tsx
// Wrong — bypasses the token system
<View className="bg-white dark:bg-gray-900 text-black dark:text-white" />

// Correct — single class, flips automatically
<View className="bg-surface text-default" />
```

The ESLint config (`apps/mobile/eslint.config.js`) will warn on `dark:bg-*`,
`dark:text-*`, and `dark:border-<word>` in className attributes.

**Structural `dark:` variants are fine** and will not be flagged:

```tsx
dark:border      // adds a border in dark mode (width toggle, no color)
dark:border-b    // adds a bottom border (directional, no color)
dark:shadow-none // removes shadow in dark mode
dark:flex        // layout / display change
```

## Components that bypass Tailwind

A small set of components pass colors directly as JS props — `style.color`,
`placeholderTextColor`, icon color props. These use `usePaletteColors()`:

```tsx
import { usePaletteColors } from '@/theme/usePaletteColors';

function MyComponent() {
  const palette = usePaletteColors();
  return (
    <TextInput
      placeholderTextColor={palette.textTertiary}
      style={{ color: palette.textDefault }}
    />
  );
}
```

`usePaletteColors()` returns the active-theme hex palette
(`lightPalette` / `darkPalette` from `@beach-kings/shared/tokens`). Never
import `colors` / `darkColors` directly — use this hook instead.

## Adding a new semantic role

1. Add an entry to `const roles` in `packages/shared/src/tokens/semantic.ts`
   as `[light hex, dark hex]`.
2. Re-run `npx tsc` to propagate the new `SemanticRole` union type.
3. The new Tailwind class is automatically available (e.g. role `bgFoo` →
   `bg-foo`).
4. Add the new role to the `PaletteColors` mock in any test files that call
   `usePaletteColors()`.

## Web app note

The web app (`apps/web`) uses a different approach: Chakra UI theme tokens.
The semantic variable system described here is mobile-only. Do not apply
`NativeWind` or `usePaletteColors` patterns to web components.
