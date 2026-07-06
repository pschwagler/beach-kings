# Mobile QA Findings — 2026-07-05

Exploratory E2E pass on the iOS simulator (Beach League app), triaged against current source. **Social tab excluded** (actively under construction). Player names genericized (public repo).

> **Stale-bundle caveat:** two issues observed live (C1 crash, I2 league search) do **not** appear in the current working-tree source. The simulator was likely running an older JS bundle. **Re-verify C1 and I2 against a fresh build before investing.**

Tags:
- **Quick** — self-contained, one-file fix, no shared mechanism.
- **Structural** — needs a centralized mechanism / cross-cutting change.
- **Investigate** — real symptom, but root cause not confirmable from static reading; needs live repro.

---

## Quick wins (localized)

> **Status 2026-07-05:** Q1 (frontend guard), Q2, Q3 — **DONE**. Fixes + tests landed; `tsc` clean, all suites green. Q1 backend `date or ""` fix still outstanding (see below).

### Q1. "Rating History" chart x-axis renders "undefined NaN"  ✅ DONE (frontend)
- **Severity:** High (garbage on a headline stat) · **Repro:** Profile → My Stats → Rating History.
- **Root cause:** `RatingChart.tsx:64-69` (`shortDate`) does `iso.split('-')`; if `iso` is `""` or malformed, `month`/`day` are `undefined` → renders literally `"undefined NaN"`. Data source: backend `calculation_service.py:576-583` (`_build_elo_history`) persists `date=date or ""`, so empty dates flow through `my_stats_service.py:357-379` untouched (`date: str`, no validation).
- **Fix:** Two-layer. ✅ **Frontend guard** shipped: `shortDate()` now returns `''` for empty/malformed dates (`RatingChart.tsx:64`), test in `__tests__/components/RatingChart.test.tsx`. ⬜ **Backend** `date or ""` in `calculation_service.py:576-583` still lets bad dates into `elo_history` — file separately.

### Q2. Player profile subtitle renders a dangling "--"  ✅ DONE
- **Severity:** Medium (polish) · **Repro:** profile with an empty `level`.
- **Root cause:** `PlayerProfileHeader.tsx:76-88`. Separator gated by `location.length > 0 && level != null` (line 81), but `level = player.level ?? null` (line 37) doesn't nullify an **empty string** — so `level: ""` still renders the `--` and an empty pill.
- **Fix:** ✅ Shipped — empty/whitespace `level` normalized to `null` (`PlayerProfileHeader.tsx:37`), and the `--` separator replaced with a `·` middot. Test in `__tests__/components/PlayerProfileHeader.test.tsx`.

### Q3. Courts with 0 reviews show "0.0" ★★★★★  ✅ DONE
- **Severity:** Low (polish) · **Repro:** Courts → any court with no reviews.
- **Root cause:** Duplicated, no shared component — `CourtRow.tsx:116-119` (`{(court.average_rating ?? 0).toFixed(1)} ({court.review_count ?? 0})`) and `CourtDetailScreen.tsx:57-89` (`StarRatingBar`). Neither guards `review_count === 0`.
- **Fix:** ✅ Shipped — both call sites now render "No reviews yet" when `review_count === 0` (`CourtRow.tsx:116`, `CourtDetailScreen.tsx` `StarRatingBar`). Tests in `court-row.test.tsx` + `court-detail.test.tsx`. Follow-up (optional): extract one shared `StarRating` to de-dupe the two implementations.

---

## Structural (needs a centralized mechanism)

### S1. Back button returns to Home tab instead of originating tab  ✅ DONE (+ review hardening)
- **Severity:** High (pervasive) · **Repro:** any pushed screen → back chevron → Home. Reproduced from Leagues and Profile→My Games (3×).
- **Root cause:** `app/_layout.tsx:34` renders a bare `<Slot />` at the root instead of nesting `(tabs)` inside a shared `<Stack>` with `(stack)` screens — so `(tabs)` and `(stack)` are independent navigators. Pushing from a tab leaves the target with no back-history → `useBack.ts:14-20` sees `router.canGoBack() === false` → falls back to each screen's hardcoded `backFallback`, which is `routes.home()` in many screens (`SessionDetailScreen.tsx:334/347/362`, `CourtsScreen.tsx:168`, `TournamentsListScreen.tsx:162/185/200`, `NotificationsScreen.tsx:43`, `KobScreen.tsx:128/142`, `ComingSoon.tsx:25`, `InvitePlayersScreen.tsx:295`).
- **Fix:** ✅ Shipped — root navigator restructured per prescription: `app/_layout.tsx` renders a real root `<Stack>` (index/(auth)/(tabs)/(stack)) so pushed screens share back-history with tabs; back is temporal-first (`useBack` pops when history exists) with a centralized `routeUp` Up-map in `lib/navigation.ts` used only for deep-link/cold-start entry; per-screen `backFallback` values deleted. `Tabs backBehavior="firstRoute"` for Android system back. See `docs/navigation.md`.
- **Review hardening (2026-07-05, multi-agent review of the S1/S2 diff, all fixed):**
  - **Logout PII flash (critical):** the shared root history retained the authenticated `(tabs)` entry after logout — Android hardware back on Welcome popped to the previous user's screen. Fixed: `AuthContext` guard now `router.dismissAll()` (when `canDismiss()`) before `replace(welcome)`. Regression tests in `__tests__/contexts/AuthContext.test.tsx`.
  - **Unauthenticated fallback to Home (high):** `(auth)` screens with `showBack` + no history fell through `useBack`'s `?? routes.home()` into the authenticated Home. Fixed: `routeUp` entries for login/signup/forgot-password/verify → `welcome`.
  - **`routeUp` gaps (high):** 8 pushable `(stack)` routes (incl. the deep-link targets `messages/[playerId]`, `notifications`, `invite/[token]`) were missing → silent Home fallback. Fixed: entries added, `resolveUp` warns in `__DEV__` on unmapped `(stack)` routes, and a filesystem-exhaustiveness test in `__tests__/lib/navigation.test.ts` pins the map to `app/(stack)/**`.
  - **Unmigrated back buttons:** `MessageThreadScreen` and `InvitePlayersScreen`'s empty-state called bare `router.back()` (dead button on cold start). Both now use `useBack()`.
  - **Cleanup:** dead `backFallback`/`fallback` props removed from `TopNav`/`BackButton`; 19 orphaned `routes` imports deleted; `SessionBottomSheet` hardcoded route → `routes.addGames()`; `useBack` reads segments/params via refs so the handler identity is stable (no app-wide re-render churn on navigation).

### S2. Avatar background color differs for the same player across screens  ✅ DONE
- **Severity:** Low-Medium (inconsistency) · **Repro:** same player navy in roster picker, teal elsewhere.
- **Root cause:** `Avatar.tsx:16,52-65` — color is **not** derived from name/id/hash; it's whichever `variant` prop the caller passes. `RosterPicker.tsx:207-211` passes `variant="brand"` (navy in light), while `HomeHeader.tsx:82`, `MessageThreadScreen.tsx:195`, `ProfileHeader.tsx:66`, `FriendRow.tsx`, `SuggestionRow.tsx` omit it → default `"teal"` (`#4daacc`). ~8 call sites making independent choices.
- **Fix:** ✅ Shipped — standardized on the existing deterministic `colorSeed` mechanism: every player-identity avatar now passes `colorSeed={player_id}` so the same player renders the same color everywhere. Converted call sites: `RosterPicker` search row (was `variant="brand"`), `ProfileHeader`, `MessageThreadScreen`, and `HomeHeader` (new `playerId` prop threaded from `home.tsx`). Social rows (`FriendRow`/`SuggestionRow`/`FriendRequestCard`) already seeded by id. **Left alone (intentional, color ≠ identity):** `ScoreBoard` + seated roster chip keep their team teal/gold variants. Convention documented in `Avatar.tsx` docstring. Tests: `home-primitives.test.tsx`, new `ProfileHeader.test.tsx`, `thread.test.tsx`, `score-game.test.tsx`; `tsc` clean, suites green.
- **Review follow-up (2026-07-05, fixed):** `ConversationRow` (Messages list) still hand-rolled a flat `bg-[#7fb3c7]` circle — same player showed different colors between the list and the thread it opens. Now renders the shared `Avatar` with `colorSeed={player_id}` (`size="md"`, matching FriendRow/SuggestionRow). Test in `MessagesTab.test.tsx`. Still open (deliberate): enforcement is by convention/docstring — `colorSeed` remains optional; and the public `PlayerProfileHeader` hand-rolls its own initial circle (no photo support) — worth its own ticket.

### S3. Leagues list "No games yet this season" despite active standings  ⚠ investigate
- **Severity:** Medium-High (contradicts visible data) · **Repro:** Leagues (View All) → active league with played Season-4 records shows "No games yet this season"; all leagues show the same.
- **Findings:** `LeagueCard.tsx:50,54,99-125` — `gamesPlayed = league.games_played ?? userWins + userLosses`; empty-state gated on `gamesPlayed > 0`. Backend `league_data.py:868-940` (`get_user_leagues`) scopes `games_played` to the resolved "current" season (resolution block lines 750-805) and it equals `standings[0].games` in the *same* payload — so no in-payload inconsistency. Likely **cross-endpoint**: the league-detail Standings tab (`LeagueDashboardTab.tsx`) may display a different season than the list card's "current".
- **Fix:** Structural — a single source of truth for "current season" shared by the leagues list and league-detail/standings. Confirm with a real multi-season account first.

---

## Investigate (real symptom, root cause unconfirmed)

### C1. CRASH — "Opponents" tab in My Stats › Breakdown  ⚠ observed live, NOT in current source
- **Severity:** High (observed hard crash) · **Repro (live):** Profile → My Stats → Breakdown → "Opponents" → redbox *"Couldn't find a navigation context…"*, cited `BreakdownTable.tsx (15:1)`.
- **Static check:** `Games/BreakdownTable.tsx` has **no** `useNavigation`/react-navigation hook (only an unused `useCallback` import at line 8). The app's only `useNavigation()` is `ScoreGameScreen.tsx:329` (unrelated). `__tests__/app/stack/games/my-stats.test.tsx` (incl. "switches to opponents tab") — 19 tests pass, no crash.
- **Assessment:** Most likely the **simulator ran a stale bundle**. Re-run on a fresh build. If it still crashes, capture the full JS stack — current source doesn't contain the cited hook.

### I2. League-game player search doesn't filter (Pickup does)  ⚠ observed live, no static asymmetry
- **Severity:** High (search non-functional in league flow) · **Repro (live):** League create-session search doesn't filter; Pickup identical UI does.
- **Static check:** Both flows share one component/hook (`RosterPicker.tsx` + `useScoreGameScreen.ts`; title switches on `leagueId != null` at `ScoreGameScreen.tsx:67`). Filter at `useScoreGameScreen.ts:657-683`: trusts backend `searchResults` when non-empty, else local `.includes(q)`. Backend `player_data.py:574-766` applies `name_match` uniformly regardless of `league_id`/`session_id`.
- **Leading hypothesis:** In league mode the frontend "trusts" backend `searchResults`; if that branch returns the full candidate list (or search isn't triggered) the list looks unfiltered, whereas pickup falls through to the working local `.includes`. Post-debounce backend path is **untested** (`useScoreGameScreen.test.tsx:733-743` only hits the local pre-debounce path).
- **Fix:** Investigate — add a league-context test past the 250ms debounce + reproduce with real data. Could be quick once the divergent branch is confirmed.

### I3. League Info tab shows every member as "Member" + Remove button  ⚠ static logic looks correct
- **Severity:** Medium (authz/role) · **Repro:** League → Info → all members "Member" + Remove each; no Admin/Owner.
- **Static check:** `LeagueInfoTab.tsx:187-223` fed by `useLeagueInfoTab.ts:90` (`role: m.role === 'admin' ? 'admin' : 'member'`). Backend `league_data.py:2000-2031` passes raw `LeagueMember.role` through; creator gets `role="admin"` at `league_data.py:144`. No code path forcing all→member.
- **Coverage gap:** `useLeagueInfoTab.test.tsx:116-119` never asserts `members[0].role === 'admin'` despite an admin in the fixture.
- **Fix:** Investigate — check the live `/api/leagues/:id/members` response for the affected league. Add the missing role-mapping test regardless. Also confirm Remove is server-side gated on viewer permission.

---

## Won't fix / expected

### W1. All-time standings "Rating" column non-monotonic vs rank
Standings rank by wins, so Rating isn't sorted descending. **Confirmed expected** — no change.

---

## Suggested order
1. **Q1 frontend guard, Q2, Q3** — fast, confirmed, independent. Ship anytime.
2. **Re-verify C1 & I2 on a fresh build** — cheap, and may dissolve them (or give a real stack/branch to fix).
3. **S1** (navigator restructure) — highest structural impact.
4. **I3, S3** — need a live API response / multi-season account to scope.
5. **S2** (avatar variant) + **Q1 backend** `date or ""` fix.
