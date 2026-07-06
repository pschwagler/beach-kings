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
- **Fix:** Two-layer. ✅ **Frontend guard** shipped: `shortDate()` now returns `''` for empty/malformed dates (`RatingChart.tsx:64`), test in `__tests__/components/RatingChart.test.tsx`. ✅ **Backend half resolved as by-design (2026-07-05):** `date or ""` is the intentional "no date" sentinel for **sessionless matches**, which must still persist (they shape the rating line — pinned by `test_matches_without_session_included`). Skipping them was tried and reverted. Sentinel now documented in the `_build_elo_history` docstring + pinned by `test_build_elo_history_sessionless_match_uses_empty_date_sentinel`. Only a `Match.created_at`-style column would give these rows a real date — not worth a migration for a cosmetic label.

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

### C1. CRASH — "Opponents" tab in My Stats › Breakdown  ✅ DONE (root-caused + fixed 2026-07-05)
- **Severity:** High (hard crash) · **Repro:** Profile → My Stats → Breakdown → tap either toggle → error boundary ("Something went wrong") + redbox *"Couldn't find a navigation context…"*.
- **NOT a stale bundle** — reproduced deterministically on a cold-started fresh bundle. The nav-context message is a red herring.
- **Root cause (bisected live):** toggling the **`shadow-sm` class** on the active segment's `Pressable` between re-renders crashes NativeWind's css interop (nativewind 4.1.23 / react-native-css-interop 0.2.3), which surfaces as react-navigation's MISSING_CONTEXT_ERROR. Bisect: crash persisted with only `SafeAreaView + BreakdownTable` rendered, toggle-only (no rows), and vanished the moment `shadow-sm` was removed. Both toggle directions crashed; initial render with either tab was fine; data was irrelevant.
- **Why tests can't catch it:** Jest runs without the nativewind `jsxImportSource` (`babel.config.js` `isTest` branch), so the interop path never executes — device-only bug class.
- **Fix:** ✅ Shipped — active-segment shadow moved to a static RN style object (`ACTIVE_SEGMENT_SHADOW`, toggled via `style` prop); class list no longer changes shadow classes across renders. Verified on-device: toggle works both directions, cold start + hot reload. Gotcha documented in `docs/theming.md`.

### C1b. Breakdown W% column showed "0.8%" for a 30-6 record  ✅ DONE (found during C1 verification)
- **Severity:** Medium (wrong numbers on a stats surface) · **Repro:** My Stats → Breakdown (all-time) — every W% under 1%.
- **Root cause:** unit mismatch between the two backend paths feeding `partners`/`opponents`: the `days`-windowed path computes `wins/games*100` (percent), but the lifetime/aggregates path passed the stored **0–1** `win_rate` column through raw. Same bug class as the already-guarded `overall` block (`test_league_overall_win_rate_units`) — the relations path was missed.
- **Fix:** ✅ Shipped — `_partners_from_aggregates` / `_opponents_from_aggregates` now convert `win_rate * 100`; regression test `test_relation_win_rate_units_from_aggregates` seeds canonical 0–1 rows and asserts 83.3 / 40.0. Verified on-device after backend rebuild (71.4%, 57.1%, 100% render correctly).

### I2. League-game player search doesn't filter (Pickup does)  ✅ RESOLVED — stale bundle; coverage gap closed (2026-07-05)
- **Severity:** High (search non-functional in league flow) · **Repro (live):** League create-session search doesn't filter; Pickup identical UI does.
- **Re-verified on a cold-started fresh bundle:** league create-session search filters correctly — "colan" → single matching row, nonsense query → "No players match your search." Does NOT reproduce; unlike C1, this one *was* the stale bundle.
- **Coverage gap closed:** the post-debounce backend branch was untested. New case in `useScoreGameScreen.test.tsx` ("league search past the debounce…") advances past the 250ms debounce with fake timers and asserts `searchPlayers` is called scoped to the league and that a backend-only player replaces the local stopgap filter — the decisive branch distinction the old test missed.

### I3. League Info tab shows every member as "Member" + Remove button  ⚠ static logic looks correct
- **Severity:** Medium (authz/role) · **Repro:** League → Info → all members "Member" + Remove each; no Admin/Owner.
- **Static check:** `LeagueInfoTab.tsx:187-223` fed by `useLeagueInfoTab.ts:90` (`role: m.role === 'admin' ? 'admin' : 'member'`). Backend `league_data.py:2000-2031` passes raw `LeagueMember.role` through; creator gets `role="admin"` at `league_data.py:144`. No code path forcing all→member.
- **Coverage gap:** `useLeagueInfoTab.test.tsx:116-119` never asserts `members[0].role === 'admin'` despite an admin in the fixture.
- **Fix:** Investigate — check the live `/api/leagues/:id/members` response for the affected league. Add the missing role-mapping test regardless. Also confirm Remove is server-side gated on viewer permission.

### I4. Friend-request notification stays actionable after the request is resolved elsewhere
- **Severity:** Low-Medium (confusing dead action) · **Repro (live, Social-hub visual pass 2026-07-05):** Bob's request to Patrick was accepted via API; the Notifications tab still shows that "Friend Request" notification with live Accept/Decline buttons.
- **Assessment:** The notification payload isn't refreshed against the request's current status; tapping Accept on an already-accepted request presumably 4xxes. Either backend should mark the notification resolved when the request state changes, or the mobile row should swap the buttons for a status label when accept/decline fails with "already handled".

### I5. Player profile for 0-game players shows misleading "Check your connection" error
- **Severity:** Low-Medium (misleading copy, dead-end from Friends tab) · **Repro (live):** Social → Friends → tap a friend with 0 games (e.g. a fresh seeded user) → "Could not load profile / Check your connection and try again." Retry never succeeds.
- **Root cause (confirmed):** `GET /api/public/players/{id}` 404s by design for players with `total_games < 1` (`apps/backend/services/public_service.py: get_public_player` — "Only players with total_games >= 1 are publicly visible"). The mobile PlayerProfile error state treats 404 like a network failure.
- **Fix:** Distinguish 404 in `PlayerProfileScreen` ("This player's profile isn't available yet") and hide Retry for it. Separately consider whether friends should bypass the games-played visibility gate — tapping your own friend and getting a dead end is odd.

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
