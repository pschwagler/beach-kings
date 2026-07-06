# Mobile Navigation — Back, Up, and the Root Stack

How navigation is structured in the app and the rules to follow when adding
screens. The goal is that **back "just works" by default**, with a small set of
explicit policies for the edges.

## The core model: one root Stack over the tabs

`app/_layout.tsx` renders a real `<Stack>` at the root (not a bare `<Slot />`).
The three top-level route groups are screens of that stack:

```
<Stack>                       app/_layout.tsx
  index                       redirects to /(tabs)/home
  (auth)                      welcome / login / signup / onboarding …
  (tabs)                      home · leagues · add-games · social · profile
  (stack)                     all detail screens (league, session, court, …)
```

Because `(stack)` is pushed **over** the still-mounted `(tabs)`, the root stack
owns a single shared back-history. Pushing a detail screen from any tab and
then pressing back returns to **that tab**, not Home.

- `(tabs)` / `(auth)` — lateral swaps driven by the auth guard
  (`AuthContext` uses `router.replace`). `gestureEnabled: false` so you can't
  swipe out of them; `fade` transition.
- `(stack)` — detail screens with `slide_from_right` + iOS swipe-to-dismiss.
- The `(stack)` group keeps its own nested `<Stack>` (`app/(stack)/_layout.tsx`)
  so deep push chains (league → player → session) pop one level at a time, and
  so stack-scoped providers (`AddNewPlayerProvider`, `InvitePlayersProvider`)
  stay scoped to detail screens instead of polluting the root.

## Back vs. Up

Two different ideas — keep them separate:

- **Back (temporal)** — "undo my last navigation," pop the stack. This is what
  the nav-bar chevron, the iOS edge-swipe, and Android system back all do. It is
  the default and covers ~95% of screens for free.
- **Up (hierarchical)** — "go to this screen's logical parent." Used **only**
  when a screen is the entry point (deep link, notification tap, cold start) and
  there is no history to pop.

`useBack()` (`src/hooks/useBack.ts`) implements exactly this: if
`router.canGoBack()` it pops; otherwise it navigates to the route's Up target.

## The three edge policies (decided once, centrally)

### 1. Up targets — `routeUp` in `src/lib/navigation.ts`

The single source of truth for "where does back go when this screen was opened
directly." Keyed by the un-normalized route pattern that
`useSegments().join('/')` produces (dynamic segments stay as `[id]`, group
included), e.g. `(stack)/court/[id]/photos`. Values are a static route or a
builder that receives the current params:

```ts
'(stack)/my-games': routes.profile(),
'(stack)/league/[id]': routes.leagues(),
'(stack)/court/[id]/photos': (p) => routes.court(firstParam(p.id)),
```

Screens **do not** hardcode a back target. `useBack(fallbackOverride)` still
accepts an explicit override, but it is escape-hatch-only for rare inline
sub-views — normally call it with no argument and let the map resolve.
`TopNav`/`BackButton` do not expose this override as a prop (there are no
callers left that need it); pass `onBack` instead if a sub-view needs a fully
custom handler.

Adding a detail screen? Add one `routeUp` entry. If you skip it, back still
works when navigated-into; only the deep-link entry falls back to Home.

### 2. Tab back-behavior — `backBehavior` in `app/(tabs)/_layout.tsx`

Android-only (iOS has no system back for tabs). Set to `firstRoute`: back from
any tab returns to Home, then exits — the least-surprising, platform-standard
behavior. Flip to `history` if we ever want back to retrace visited tabs.

### 3. push vs. replace in terminal flows — a convention

The framework gives correct back; the **flow author** chooses whether a step is
revisitable. Creation/confirmation flows should `router.replace` their final
step so back skips the completed form instead of re-entering it
(e.g. create-league → league detail; score-game → summary). Use `router.push`
for normal forward navigation.

## Adding a screen — checklist

1. Put the file under `app/(stack)/…` and add a `routes.*` helper.
2. `router.push(routes.x())` to navigate in — back works automatically.
3. Add a `routeUp` entry if the deep-link/cold-start parent should not be Home.
4. Render `<TopNav title=… showBack />` — no `backFallback` needed.
5. If the screen is the end of a creation flow, `replace` into it, don't `push`.

## Testing note

`useBack` reads `useSegments()`, `useLocalSearchParams()`, and
`router.canGoBack()`. Any test that renders a real `BackButton` must provide all
three in its `expo-router` mock:

```ts
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ canGoBack: () => true, back: jest.fn() }),
}));
```
