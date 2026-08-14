# E2E validation report — 2026-08-12

## Outcome

Validation was run against the journeys and route inventory in
`docs/E2E_APP_FLOW_MAP.md`. The run was stopped when the broad backend pass had
accumulated roughly 20 failing tests, as requested. Those failures were
deduplicated below: the run found **13 distinct actionable issues**, not 20
distinct product defects. As of the 2026-08-13 follow-up, **9 of the 13 are
resolved** (see below) and **4 remain open**, plus one new coverage item
tracked below.

The app is **not ready for a whole-app E2E sign-off**. Web public surfaces and
the new web age-eligibility happy path are usable, and the authenticated
Chromium suite now runs end-to-end (130 passed / 69 failed / 3 skipped / 7 did
not run, down from near-total blockage). iOS device coverage remains blocked by
a native build failure, and the remaining web failures are a heterogeneous tail
that needs per-spec triage.

No remote database was touched. The only database reset performed was the
isolated local `docker-compose.test.yml` volume after its schema was found in a
partially migrated state.

## What passed

- Web production build: passed, including TypeScript and generation of all 19
  static pages.
- Web age gate, adult happy path: passed in headless Chromium. The eligibility
  endpoint returned 200, account fields appeared, and the Navbar remained
  visible.
- Anonymous web route smoke: public discovery, court directory, location
  directory, legal, community guidelines, support, contribute, and unknown-URL
  pages rendered with the Navbar. The unknown URL returned 404.
- Public Playwright subset: 6 of 13 checks passed. Most of the seven failures
  were obsolete selectors/assertions rather than broken page rendering.
- Mobile Jest initially had two stale onboarding suites. After removing the
  obsolete DOB contract, all 202 suites pass: 2,729 tests passed and 5 skipped.
- Focused backend safety/policy/readiness checks: 39 passed.

## Follow-up fixes — 2026-08-13

The following issues from the initial run were resolved and verified. They are
removed from the open-issue list below.

- **Signed-out Navbar (issue 2).** `/home` now renders the signed-out Navbar in
  the auth-initializing, anonymous-redirect, and session-expired states, and
  `/profile` renders it while its redirect resolves
  (`src/components/HomePage.tsx`, `app/profile/page.tsx`).
- **Youth interaction policy season logic (issue 3).**
  `services/social/youth_interaction_policy.py` now uses the canonical
  `_active_season_conditions` from `services/leagues/league_data.py` instead of
  inline `Season.start_date/end_date` comparisons. The centralization guard
  passes (50/50 across the centralization, interaction-policy, youth-safety,
  and message-write-policy suites).
- **Google Identity double-initialization (issue 4) and invalid button width
  (issue 5).** The stock `GoogleLogin` was replaced with
  `src/components/auth/GoogleAuthButton.tsx`, which initializes GIS once per
  page load and measures a valid pixel width (clamped to 200–400) via
  ResizeObserver instead of the rejected `100%`.
- **Landing logo LCP (issue 6).** The above-the-fold logo in `app/page.tsx`
  now loads with `priority`.
- **Playwright user factory (issue 8).** `createTestUser` in
  `tests/e2e/fixtures/api.js` traverses `/api/auth/youth-eligibility` and
  passes the required `eligibility_token`, cached per worker with one
  refresh-and-retry on 403. The full factory flow (eligibility → signup →
  verify → login) passed live against the local test stack.
- **Web signup page object (issue 9).** `AuthPage` traverses the eligibility
  gate before the account-details step. The full signup spec passes 5/5,
  including the UI journey: age gate → account details → verification →
  redirect to `/home`.
- **Test location slug seed (issue 10).** `global-setup.js` now runs the
  idempotent location upsert unconditionally, so an existing `socal_sd` row
  with a stale slug is normalized to `mission-beach-ca`. Verified by resetting
  the slug to `mission-beach` and watching global setup correct it.
- **Mobile onboarding DOB contract (issue 12).** Resolved in the original
  follow-up validation: obsolete DOB assertions were removed and the nickname
  keyboard assertion now matches the end of the form.

Additional defects found and fixed during follow-up verification:

- **Phone/email signup returned 500.** `create_verification_code` unpacked the
  User-only youth fields (`profile_is_private`, `show_game_history`) into
  `VerificationCode`, which lacks those columns. `user_service.py` now filters
  to actual `VerificationCode` columns; the verify step already re-derives the
  privacy defaults from `age_group`.
- **`seedPlayerGlobalStats` fixture violated NOT NULL `avg_point_diff`.** This
  single fixture defect caused 149 of 165 failures on the first full-suite
  rerun. Fixed in `tests/e2e/fixtures/db.js`.
- **`createTestSession` used the retired session-creation route.** Session
  creation moved to `POST /api/sessions` (the league-scoped path is GET-only
  and returned 405). Fixed in `tests/e2e/utils/test-helpers.js`.
- **Admin platform stats endpoint returned 500.** `/api/admin-view/stats`
  queried `matches.date`, but the date lives on `sessions`. The Games count now
  filters via `session_id IN (SELECT id FROM sessions WHERE created_at >= …)`
  in `api/routes/admin.py`. Verified live with an admin token (200 with real
  counts).

## Distinct issues (open)

### Confirmed product/build defects

1. **P0 — the local iOS toolchain is too old for Expo SDK 57.** A clean Debug
   simulator build fails in `ExpoModulesJSI` under Xcode 26.1.1 / Swift 6.2.1.
   Expo SDK 57 uses `weak let`, which requires Swift 6.3 (Xcode 26.4+) rather
   than a source or dependency patch. The checked-in EAS profiles already use
   Xcode 26.6; local Xcode should be upgraded to match. Until then, local iOS
   E2E journeys including auth, cache isolation, deep links, courts, and
   scoring cannot run.

### E2E infrastructure and coverage defects

2. **P0 — the web E2E reset path does not reset its database.**
   `ensure-test-infra.js` prints “Resetting test database” but deliberately
   preserves the test volume. A stale schema without `alembic_version` then
   failed migration 040 with `DuplicateTableError: device_tokens already
   exists`. Removing only the isolated test volume restored the backend.

3. **P1 — public web specs use obsolete or non-unique locators.** Examples
   include removed court directory/card class names, `nav` matching both the
   Navbar and breadcrumb, two responsive count nodes, two mail links, and old
   not-found copy. These failures obscure otherwise rendered pages. Still
   visible in the follow-up full-suite run (strict-mode violations on `nav`
   and `a[href^="mailto:"]`, missing `.court-directory__title`/`.court-card`).

4. **P1 — the broad backend suite leaks async database connections across
   event loops.** After initial failures, many endpoint/admin checks cascade
   into `Future attached to a different loop`, returning 500 or 403 instead of
   their expected results. This makes the broad suite unreliable as an E2E
   prerequisite. The focused safety/policy runs pass in isolation.

5. **P1 — remaining authenticated-suite failures need per-spec triage.** The
   follow-up full-suite run passed 130 of 209, with ~69 failures spread thin
   across ~20 specs (stats tab, pickup-session edit, profile edit/avatar, DM
   navigation notifications, court reviews/moderation, several public pages).
   No single dominant root cause remains; notable signals include a
   `useLeague must be used within a LeagueProvider` ErrorBoundary catch, 4
   cleanup-ordering FK violations on `players` deletion, and assorted
   400/401/403/404 responses. Each needs individual diagnosis to separate test
   drift from product defects.

## Journey status from the flow map

| Journey group | Status | Evidence / blocker |
| --- | --- | --- |
| `E2E-AUTH-01` | Partial | Web adult eligibility step and full signup spec (5/5) pass; login/forgot-password specs largely pass; iOS blocked by build. |
| `E2E-GAME-01/02` | Partial | Web session/match specs mostly pass after the session-endpoint fix; `pickup-session-edit` still has failures; iOS blocked; Maestro still does not submit/persist/edit. |
| `E2E-LEAGUE-01` | Partial | Web league specs mostly pass; `season-awards`, `edit-sessions-matches`, `weekly-schedules` have failures; iOS blocked. |
| `E2E-SOCIAL-01`, `E2E-POLICY-01` | Partial | Focused backend policy tests pass; mobile unit coverage passes; live two-user device journey blocked. |
| `E2E-COURT-01` | Partial | Anonymous court list/detail/API render; web court review/moderation specs have failures; iOS blocked. |
| `E2E-CACHE-01`, `E2E-DEEP-01` | Blocked | Require a working current iOS build. |
| `E2E-ADMIN-01/02` | Partial | Admin stats endpoint fixed; some admin specs (court moderation/photos) still fail; backend broad-suite event-loop cascades remain. |
| P1 profile/invite/notify/recovery/account/KOB | Partial | Profile onboarding/home-courts and notification specs run; edit-profile avatar and DM-notification specs have failures; mobile device unavailable. |
| `E2E-RESP-01` | Partial | Desktop anonymous route sweep completed; signed-out Navbar defect fixed in follow-up; authenticated/mobile viewport sweep blocked. |
| P2 geo/empty/external/access/unavailable/static | Partial | Public/static render smoke completed; device, accessibility, failure injection, and authenticated variants remain. |

## Commands and totals

- `npm run build --workspace @beach-kings/web` — passed.
- Chromium Playwright inventory — 209 tests discovered.
- Public Chromium subset — 13 run, 6 passed, 7 failed.
- Targeted web signup happy-path spec — failed at the stale phone-field wait;
  direct headless eligibility traversal passed.
- `npm test --workspace @beach-kings/mobile -- --runInBand` — after the
  follow-up cleanup, 202 suites passed; 2,729 tests passed and 5 skipped.
- Clean `xcodebuild` for iPhone Air simulator — failed in ExpoModulesJSI.
- Focused backend safety/policy/readiness run — 39 passed.
- Broad backend run — stopped near the requested failure threshold at about
  18% completion; failures were deduplicated rather than treated as separate
  defects.
- Follow-up 2026-08-13: `npx tsc --noEmit -p apps/web/tsconfig.json` — clean;
  `npm run build --workspace @beach-kings/web` — passed; live factory smoke
  (eligibility → signup → verify → login) — passed; signup spec — 5/5 passed;
  admin stats endpoint smoke — 200 with real counts;
  `pytest test_active_season_centralization.py test_interaction_policy_unit.py
  test_youth_safety.py test_message_write_policy.py` — 50 passed.
- Full Chromium suite progression on 2026-08-13: 34 passed (fixture blockage) →
  122 after the `avg_point_diff` fixture fix → 131 after the session-endpoint
  fix → 130 passed / 69 failed / 3 skipped / 7 did not run after the admin
  stats fix (remaining failures are the triage tail in open issue 5).

## Recommended unblock order

1. Upgrade local Xcode to 26.4+ (prefer 26.6 to match the EAS profiles); do not
   patch `expo-modules-jsi` from `weak let` to `weak var`.
2. Make local E2E database resets truthful and deterministic
   (`ensure-test-infra.js`).
3. Repair backend async test isolation, then rerun the broad backend suite.
4. Triage the remaining ~69 authenticated-suite failures spec by spec,
   starting with the `useLeague` provider error and the `players`-deletion FK
   ordering in fixture cleanup.
5. Refresh the stale public/mobile locators and add actual Maestro coverage
   for signup, scoring persistence, leagues, courts, cache isolation, and deep
   links.
