# E2E validation report — 2026-08-12

## Outcome

Validation was rerun against `docs/E2E_APP_FLOW_MAP.md` after installing Xcode
26.6. The Xcode/Swift blocker is resolved: a clean Debug simulator build now
succeeds, the app installs, and iOS 26.5 renders correctly.

The app is **not ready for whole-app E2E sign-off**. The rerun did not reach 20
distinct issues; it reached the requested 20-failure cap in Playwright because
the same signup fixture defect repeated across tests. Those failures are
deduplicated below.

No remote database was touched. Validation used the local development database
and isolated test containers. The rerun did not delete or reset any database
volume. It added a local league membership, friend request, pickup game, and
submitted pickup session while exercising real happy paths.

## What passed in the rerun

- Clean native iOS build with Xcode 26.6 / Swift 6.3.3.
- App install and launch on an iPhone 17 Pro simulator running iOS 26.5.
- Mobile Jest: 202 suites passed; 2,729 tests passed and 5 skipped.
- Maestro prerequisite/syntax checks: all 4 passed.
- Native public welcome, login, and age/location gate rendering.
- Native authenticated Home and all five primary tabs.
- League discovery, joining, detail, standings, chat, and info views.
- Pickup-game happy path: selected four players, saved a 21–15 game, viewed the
  persisted session, confirmed submission, and saw the submitted state.
- Social messages empty state, notifications empty state, suggested players,
  and sending a local friend request.
- Profile, settings, and dark-theme switching.
- Playwright still discovers all 209 Chromium tests and can start its isolated
  API/database stack.
- The location slug bootstrap defect from the first pass is resolved by the
  current `ON CONFLICT DO UPDATE` setup.

## Distinct unresolved issues

### Confirmed product defects

1. **P0 — invalid forgot-password phone input returns 500.** Submitting
   `+11234567890` reaches `normalize_phone_number`, raises `ValueError`, and the
   exception escapes the reset-password endpoint. Invalid user input should
   produce a validation 4xx response.

2. **P1 — signed-out protected web pages omit the required Navbar.** The prior
   pass found all nine `/home?tab=...` variants and `/profile` rendering the
   anonymous welcome state without `nav.navbar`, contrary to the repository
   rule. This path remains unresolved.

3. **P1 — youth interaction policy duplicates active-season date logic.** The
   backend centralization guard still identifies direct season date comparisons
   instead of use of the canonical active-season resolver.

4. **P2 — Google Identity is initialized multiple times on one auth visit.**
   Chromium warns that only the final initialization will be used.

5. **P2 — Google Identity receives an invalid `100%` button width.** The
   provider rejects that configuration on the auth surface.

6. **P3 — the landing-page LCP logo is not eagerly loaded.** Next.js reports
   the above-the-fold logo as the LCP image and recommends eager loading.

7. **P2 — player initials are passed to the native image loader as file
   paths.** League/player rendering logs failed attempts to load `AT.png`,
   `BT.png`, `CT.png`, and `DC.png` from the installed application bundle.
   Initials should render as text fallback content, not as image URIs.

### E2E infrastructure and fixture defects

8. **P0 — the Playwright user factory cannot sign up.**
   `apps/web/tests/e2e/fixtures/api.js:createTestUser` posts to signup without
   the required `eligibility_token`, receiving 403. This caused nearly all of
   the rerun's 20 failures before their target journeys began.

9. **P0 — the web signup page object skips the eligibility gate.** It waits for
   a phone field immediately, but signup now starts with country, region, and
   age range. Signup tests were interrupted at that stale wait.

10. **P0 — the mobile Maestro login bootstrap cannot pass the iOS dev-client
   launch sequence.** Its generated login flow does not handle the native
   “Open in Beach League?” alert, the development-server picker, or the Expo
   first-run developer-menu overlay. The full social suite therefore stops
   before `welcome-sign-in-link` even though the app itself launches.

11. **P0 — the local mobile API origin is a stale LAN address.** `.env` points
    at `192.168.50.103:8000`; the current host is `192.168.50.88:8000`. Direct
    API login succeeds, while the app reports a generic invalid-credentials
    alert until Metro is started with the correct explicit origin.

12. **P1 — the Expo development overlay steals app taps in the top-right
    corner.** It intercepted both the league `Add game` action and Social's
    `Find Players` tab, opening Expo Tools instead. This makes those routes
    unreachable to coordinate/ref-driven E2E in the current dev-client build.

13. **P1 — `make seed-users` does not normalize existing fixture accounts.**
    Alice was reported as an existing `test1234` user but that password did not
    authenticate. Newly created Bob authenticated, but his current-player
    profile rendered as generic “Player” / “Add name” while league membership
    rendered “Bob Test.” This makes seeded identity-dependent assertions
    nondeterministic.

14. **P1 — the web E2E reset path is not a reset.**
    `ensure-test-infra.js` reports that it is resetting the test database while
    preserving its volume. This previously allowed partially migrated schema
    state to poison a run and remains a determinism risk.

15. **P1 — public web specs contain obsolete or non-unique locators.** Removed
    court selectors, generic `nav`, duplicate responsive nodes, duplicate mail
    links, and old not-found copy obscure otherwise rendered pages.

16. **P1 — the broad backend suite leaks async database connections across
    event loops.** Failures cascade into `Future attached to a different loop`,
    making the suite unreliable as a whole-app prerequisite even though the
    focused safety/policy set passes independently.

17. **P1 — automated mobile coverage is much narrower than the flow map.** The
    checked mobile command exercises the social scenario only; there are no
    trustworthy automated device runs covering the complete auth, leagues,
    courts, cache isolation, deep-link, settings/account, unavailable-feature,
    and scoring persistence map.

## Journey status from the flow map

| Journey group | Rerun status | Evidence / blocker |
| --- | --- | --- |
| `E2E-AUTH-01` | Partial | Welcome/login/eligibility render and local login pass. Web signup automation is stale; recovery found a real 500. OAuth and complete verification permutations remain. |
| `E2E-GAME-01/02` | Partial pass | Native pickup creation, persistence, session view, confirmation, and submission pass. League scoring, edit/delete/cancel, and rejection paths remain. |
| `E2E-LEAGUE-01` | Partial pass | Discovery, join, detail, games empty state, standings, chat, and info pass natively. Creation/admin/invite/rejection paths remain. |
| `E2E-SOCIAL-01` | Partial pass | Messages, notifications, suggested players, and friend-request mutation pass. Find Players is obstructed by the Expo overlay; two-user accept/chat lifecycle remains. |
| `E2E-POLICY-01` | Partial | Focused backend checks pass, but the policy centralization defect remains and live adult/minor two-user coverage did not complete. |
| `E2E-COURT-01` | Partial | Home court links and prior anonymous web/API rendering pass. Native detail/map plus authenticated create/moderate paths remain. |
| `E2E-CACHE-01`, `E2E-DEEP-01` | Not rerun | Native build is now unblocked, but the current device harness/login and dev overlay must be stabilized first. |
| `E2E-ADMIN-01/02` | Blocked | Playwright users cannot be created and broad backend isolation is unreliable. |
| Profile/settings | Partial pass | Profile, settings index, and dark theme pass. Seeded display identity is inconsistent; account mutations and sign-out isolation remain. |
| Invite/notify/recovery/account/KOB | Partial / blocked | Notification empty state passes; recovery found a 500. Remaining mutation, external, unavailable, and KOB paths did not complete. |
| `E2E-RESP-01` | Partial | Prior desktop route sweep plus native portrait and theme rendering pass. Full viewport/device matrix remains. |
| P2 geo/empty/external/access/unavailable/static | Partial | Multiple empty and public/static states pass; failure injection and remaining device/auth variants are uncovered. |

## Commands and totals

- Clean `xcodebuild` with Xcode 26.6 — passed.
- `npm test --workspace @beach-kings/mobile -- --runInBand` — 202 suites
  passed; 2,729 passed and 5 skipped.
- `npm run e2e:check --workspace @beach-kings/mobile` — 4 prerequisite and
  syntax checks passed.
- `npm run e2e:social --workspace @beach-kings/mobile` — failed during the
  generated dev-login bootstrap before the app journey.
- `npm run test:e2e --workspace @beach-kings/web -- --project=chromium
  --max-failures=20 --reporter=line` — 209 discovered; 2 passed, 20 failed,
  5 interrupted, and 182 did not run. Failures were deduplicated above.
- Manual iOS run — authenticated core navigation, league join, pickup scoring
  and submission, social basics, profile/settings, and theme validated.

## Recommended unblock order

1. Add eligibility-token creation to the Playwright API fixture and update the
   signup page object for the eligibility gate.
2. Make the Maestro login bootstrap explicitly handle the iOS dev-client
   prompt/server/tutorial sequence, and pass the current API origin rather than
   relying on a machine-specific `.env` address.
3. Disable or reposition the Expo floating Tools control for E2E builds so it
   cannot cover application actions.
4. Make `make seed-users` normalize local fixture credentials and player names
   idempotently.
5. Convert invalid reset-password phone input into a validation 4xx.
6. Make the isolated web test reset truthful and deterministic, then repair
   backend async test isolation.
7. Rerun all 209 Chromium tests and add device flows for every still-partial
   P0/P1 journey before claiming whole-app coverage.
