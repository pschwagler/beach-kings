# Mobile Theme Tokens — Phase 0 Research

Pre-implementation answers for the open questions in the mobile semantic-token migration.
Scope: `apps/mobile` only. The web app stays on its current (legacy) approach.

## Versions in play

| Package | Version | Notes |
|---|---|---|
| `nativewind` | `^4.1.23` | v4 line — supports `vars()` helper |
| `react-native` | `0.81.5` | New Architecture enabled (`newArchEnabled: true` in `app.json`) |
| `expo` | `~54.0.27` | `userInterfaceStyle: "automatic"` set ✓ |
| `tailwindcss` | `^3.4.17` | Tailwind v3 — `<alpha-value>` placeholder works |

## Q1 — Where is the ThemeProvider, and where would we wrap a `vars()`-bearing root View?

**Owner:** `apps/mobile/src/contexts/ThemeContext.tsx`. Mounted in `apps/mobile/app/_layout.tsx` between `QueryClientProvider` and `AuthProvider`.

**Current shape:** plain React Context.Provider. **There is no root `View` and no `dark` className anywhere in the tree.** NativeWind v4 on native does not need one — `dark:` variants are activated by JS state from `useColorScheme()` / `setColorScheme()` (it ignores the `darkMode: 'class'` strategy on native and treats the Appearance API / explicit setColorScheme() call as the source of truth).

**Implication for migration:** ThemeContext needs to grow a single wrapping `<View style={vars(activeBag)}>` around `{children}`. That's the only structural change required to start using CSS-var-backed semantic tokens. Everything below it inherits the variables via standard CSS-var inheritance (NativeWind implements this on native via context).

**Sketch (not committed yet, illustrative for Phase 2):**
```tsx
import { vars } from 'nativewind';
import { lightVars, darkVars } from '@beach-kings/shared/tokens';

const lightBag = vars(lightVars);
const darkBag = vars(darkVars);

// inside ThemeProvider, replace `return <Context.Provider>{children}</Context.Provider>` with:
return (
  <ThemeContext.Provider value={value}>
    <View style={isDark ? darkBag : lightBag} className="flex-1">
      {children}
    </View>
  </ThemeContext.Provider>
);
```

Existing tests in `apps/mobile/__tests__/contexts/ThemeContext.test.tsx` mock `nativewind` cleanly — they just need `vars` added to the mock factory.

## Q2 — Do `userInterfaceStyle: 'automatic'` and the `useColorScheme` source agree?

**Yes.** Confirmed:

- `app.json` has `"userInterfaceStyle": "automatic"` (required for Expo apps to track system appearance).
- `ThemeContext.tsx` uses `useColorScheme` from `nativewind` (which delegates to RN's `Appearance` API on native, `prefers-color-scheme` on web).
- `setColorScheme('system' | 'light' | 'dark')` is wired to a persisted `themeMode` in `expo-secure-store` and reconciled on mount.

No conflict, no additional config needed. The migration inherits this without changes.

## Q3 — Trunk-based vs stacked PRs

**Trunk-based, frequent commits to `feat/ps/mobile-app-creation`** (the current working branch — user has explicitly designated it as effectively-main for mobile).

Rationale:
- Each Phase-3 domain task (Profile, Home, Leagues, etc.) is independently shippable: legacy tokens stay alongside new tokens through Phase 4.1.
- No PR review loop in play — stacked PRs would add ceremony with zero benefit.
- Self-review after each iteration replaces the PR check; test suite + simulator visual diff is the gate.

**Workflow per iteration:**
1. Implement task.
2. `npx tsc --noEmit` + `npm test` (Jest).
3. Self-review the diff (read it back, look for missed `dark:` variants, snapshot tests).
4. Commit with conventional-commit prefix.
5. Optionally: simulator visual check in both themes for the touched screens.

## Token-migration scope (sized)

Distinct color-bearing `dark:` variants found via grep on `apps/mobile/{app,src}`:

| Variant | Count | Migrates to |
|---|---|---|
| `dark:text-content-primary` | 264 | `text-default` |
| `dark:text-content-secondary` | 196 | `text-muted` |
| `dark:text-content-tertiary` | 132 | `text-tertiary` |
| `dark:bg-dark-surface` | 120 | `bg-surface` |
| `dark:border-border-subtle` | 94 | `border-divider` |
| `dark:bg-base` | 88 | `bg-page` |
| `dark:border-border-strong` | 85 | `border-strong` |
| `dark:bg-brand-teal` | 59 | `bg-brand-teal` (theme-aware var, brand color flips between modes) |
| `dark:text-brand-teal` | 48 | `text-brand-teal` (same) |
| `dark:text-text-tertiary` | 45 | **broken today** — no token defined; migrates to `text-tertiary` |
| `dark:bg-elevated` | 34 | `bg-elevated` |
| `dark:bg-dark-elevated` | 26 | `bg-elevated` (duplicate role today) |
| `dark:bg-info-bg` | 23 | `bg-info-tint` |
| `dark:bg-brand-gold` | 23 | `bg-brand-gold` |
| `dark:bg-border-subtle` | 8 | almost certainly a typo (border token used as bg) — fix during migration |
| ... | | |
| `dark:shadow-none`, `dark:opacity-*` | 22+ | **keep** — non-color, ESLint rule should allow |

Total color-bearing instances to migrate: **~1,500+**.

**Bugs surfaced by this audit:**
- 45 uses of `dark:text-text-tertiary` resolve to nothing (token undefined) — currently render with no dark override.
- All uses of `text-text-muted` (no `dark:`) render dark in light mode — the original Profile bug that started this whole effort. Confirmed widespread.
- 8 uses of `dark:bg-border-subtle` use a border color as background — likely typos.

## Light-only standalone classes worth keeping vs migrating

Classes used without a `dark:` partner today (e.g., `bg-white`, `border-gray-200`, raw `text-text-default`) need to be hunted down too — they're invisible in the dark-variant tally above. Phase-3 per-domain task includes a grep for these.

## NativeWind / Hermes / New Architecture

- `vars()` is the documented, supported v4 API for theme switching with CSS variables.
- Multiple OSS examples (Saraivinha1703/nativewind-v4-multiple-themes, willcodefor.beer post) confirm production usage with `vars()` + `useColorScheme()`.
- Known issue [#702](https://github.com/nativewind/nativewind/issues/702) re: shadcn-style `:root`/`.dark` selector toggle is **avoided** by our chosen pattern — we use `vars()` on a root `<View style>`, not CSS selectors.
- New Architecture: `vars()` is implemented in JS / native module layer, no fabric-specific concerns documented.
- Hermes: no documented incompatibility — `vars()` returns plain style objects.

**Spike 0.1 still required** (1 hour): create one `bg-surface` token end-to-end, toggle between modes on iOS sim and Android emu, confirm hot reload + production `expo export` both work. Defer until we're ready to start Phase 1 — no benefit to spiking earlier.

## Sources

- [NativeWind v4 Themes guide](https://www.nativewind.dev/docs/guides/themes)
- [NativeWind v4 vars() docs (via search)](https://www.nativewind.dev/docs/api/vars)
- [NativeWind v4 Dark Mode docs](https://www.nativewind.dev/docs/core-concepts/dark-mode)
- [Issue #702 — shadcn CSS-var toggle bug (avoided)](https://github.com/nativewind/nativewind/issues/702)
- [System Theme Support with NativeWind v4 (Cantor)](https://medium.com/@rachelcantor/system-theme-support-with-nativewind-v4-and-react-native-reusables-08fed7ff4070)
- [Multi-theme example repo](https://github.com/Saraivinha1703/nativewind-v4-multiple-themes)
