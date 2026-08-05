# Mobile Theming — Semantic Token System

## Quick reference

| Tailwind class | Role | Light | Dark |
|---|---|---|---|
| `bg-page` | Screen background | `#f5f1e8` | `#0f1718` |
| `bg-surface` | Cards, sheets | `#fffdf8` | `#172224` |
| `bg-elevated` | Inputs, raised cards | `#fffdf8` | `#202d2f` |
| `bg-inset` | Recessed areas inside surfaces | `#f5f1e8` | `#0c1415` |
| `bg-nav` | Top navigation bar | `#1a3a4a` | `#102f38` |
| `bg-tabbar` | Bottom tab bar | `#fffdf8` | `#121c1e` |
| `text-default` | Primary body copy | `#182326` | `#e8efec` |
| `text-muted` | Secondary / subdued labels | `#596568` | `#9faaa6` |
| `text-tertiary` | Placeholder text, hints | `#626d6f` | `#8a9690` |
| `text-inverse` | Text on dark backgrounds | `#fffdf8` | `#fffdf8` |
| `text-accent` | Accessible gold-toned text on reading surfaces | `#765800` | `#e0b44c` |
| `text-on-brand-teal` | Foreground on filled teal controls | `#fffdf8` | `#0f1718` |
| `text-on-brand-gold` | Foreground on filled gold controls | `#182326` | `#0f1718` |
| `text-on-danger` | Foreground on filled danger controls | `#fffdf8` | `#0f1718` |
| `text-on-success` | Foreground on filled success status | `#0f1718` | `#0f1718` |
| `text-on-warning` | Foreground on filled warning status | `#0f1718` | `#0f1718` |
| `text-on-info` | Foreground on filled info status | `#0f1718` | `#0f1718` |
| `text-on-status-live` | Foreground on filled live status | `#0f1718` | `#0f1718` |
| `border-strong` | Input borders, prominent dividers | `#ded8cc` | `#354245` |
| `border-divider` | List separators, subtle lines | `#ded8cc` | `#253134` |
| `text-brand-teal` / `bg-brand-teal` | Primary brand color | `#1a3a4a` | `#4daacc` |
| `text-brand-gold` / `bg-brand-gold` | Secondary brand color | `#d4a843` | `#e0b44c` |
| `text-success` / `bg-success-fill` | Success text / saturated fill | `#166534` / `#34a853` | `#3fb950` |
| `text-danger` / `bg-danger-fill` | Danger text / saturated fill | `#c32e3b` | `#ff6962` / `#f85149` |
| `text-warning` / `bg-warning-fill` | Warning text / saturated fill | `#854d0e` / `#f0ad4e` | `#d29922` |
| `text-info` / `bg-info-fill` | Info text / saturated fill | `#1d4ed8` / `#3b82f6` | `#58a6ff` |
| `bg-success-tint` | Success chip / row bg | `#dcfce7` | `#0d2818` |
| `bg-danger-tint` | Danger chip / row bg | `#fee2e2` | `#2a1215` |
| `bg-warning-tint` | Warning chip / row bg | `#fef3c7` | `#2a1f05` |
| `bg-info-tint` | Info chip / row bg | `#dbeafe` | `#0d1d35` |
| `text-status-live` / `bg-status-live-fill` | Live text / saturated fill | `#92400e` / `#b87900` | `#f4c060` |
| `bg-status-live-tint` | Live or in-progress status background | `#fff1d6` | `#3a2a14` |

## How it works

`ThemeProvider` in `src/contexts/ThemeContext.tsx` mounts a set of CSS custom
properties on the root View when the theme changes. Each semantic role maps to
one CSS variable (e.g. `--surface`, `--text-default`). NativeWind resolves
`bg-surface` to `rgb(var(--surface) / <alpha>)` at compile time, so the actual
color is filled in at runtime from the variable — no re-render required.

Source of truth: `packages/shared/src/tokens/semantic.ts`.

Filled controls must use their paired foreground rather than
`text-inverse`. Brand colors lift in dark mode, so a foreground that is
correct for the dark navigation surface is not necessarily correct for a
teal, gold, or danger fill.

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

## Gotcha: never toggle shadow-* classes conditionally

Adding/removing a `shadow-sm` / `shadow-md` / `shadow-lg` class between
re-renders of the *same* element crashes NativeWind's css interop at runtime
(nativewind 4.1.23 / react-native-css-interop 0.2.3) with a misleading
`"Couldn't find a navigation context"` render error. Static shadow classes are
fine; only the class list changing across renders triggers it.

For a conditional shadow, keep the class list static and toggle a plain RN
style object instead:

```tsx
style={isActive ? ACTIVE_SHADOW : undefined}  // shadowColor/Offset/Opacity/Radius + elevation
```

Jest cannot catch this — tests run without the nativewind jsxImportSource
(see `babel.config.js`), so the interop path never executes. Verify on-device.
Reference fix: `Games/BreakdownTable.tsx` (`ACTIVE_SEGMENT_SHADOW`).

## Web app note

The web app (`apps/web`) uses a different approach: Chakra UI theme tokens.
The semantic variable system described here is mobile-only. Do not apply
`NativeWind` or `usePaletteColors` patterns to web components.
