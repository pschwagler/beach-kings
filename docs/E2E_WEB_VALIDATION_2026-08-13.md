# Web flow-map validation — 2026-08-13

> Execution note: the requested report key is 2026-08-13; the fresh manual run
> documented here was performed on 2026-08-14 against the local development
> stack.

## Outcome

**FAILED SIGN-OFF.** The mapped web application cannot be signed off. The run
confirmed one release-blocking account-enforcement defect and five additional
product defects. Coverage is also incomplete for several
failure, concurrency, external-provider, and destructive-admin branches.

The highest-risk finding is that a suspended account continues into the
authenticated dashboard instead of the restricted entry screen (`WEB-002`).
Anonymous KOB score entry was observed and persisted, but the product owner
confirmed that this is intentional behavior rather than a defect.

This was an `agent-browser` Chromium run. No Playwright test was run or changed,
no product defect was repaired, and no remote database was touched. Local-only
fixtures and the repository's local impersonation utility were used to reach
actor states. The temporarily suspended fixture was restored to `active`
immediately after the observation.

## Environment and method

- Web: `http://localhost:3000`, Next.js development server.
- API: local backend at `http://localhost:8000`; local PostgreSQL and Redis.
- Browser: Chromium through `agent-browser`, headless.
- Viewports: desktop `1440×900`, phone `390×844`, and phone `375×667`.
- Sessions: isolated anonymous, incomplete-profile, member/league-admin,
  non-admin member, failure-injection, and system-admin browser sessions.
- Persistence: verified by reload for pickup roster/game/submission, league
  message, direct message, friendship acceptance, court save, KOB creation and
  public KOB score submission.
- Accessibility: accessibility snapshots, keyboard Tab/Escape, focus owner,
  dialog semantics, responsive overflow, console errors, and relevant request
  records were inspected.
- Failure injection: browser offline mode, request abort for logout, invalid
  identifiers, validation failures, cancel/confirm paths, and permission gates.

The documented `make seed-users` UI-login fixtures were unusable through the
real login form because the web phone validator rejects their reserved `555`
numbers before sending a request. Authenticated coverage continued with
`make dev-login` without recording tokens. This is tracked as `ENV-001`, not as
a production defect.

## Row-by-row coverage

Status meanings: **PASS** means all branches actually exercised for that row
passed; **PARTIAL** means the named evidence passed but one or more mapped
branches were not exercised; **FAIL** means a product defect was confirmed;
**BLOCKED** identifies descendants that could not be trusted because of a
confirmed root defect; **NOT EXERCISED** is explicit missing coverage.

### Global Navbar and overlays

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| Home icon | PARTIAL | Navbar rendered on every sampled route; anonymous `/home` returned to `/`, authenticated Home returned to `/home`. Slow auth and expiry-during-click not exercised. |
| Find Courts | PARTIAL | Desktop and both phone widths opened the populated directory with no horizontal overflow. Empty/API-error branch not exercised. |
| Record Games | PARTIAL | Opened Create Game, selected Pickup, created a session. League-choice cardinality branches not completed. |
| Leagues menu toggle | PARTIAL | Available for anonymous/authenticated actors; full keyboard/outside-click matrix not completed. Escape behavior shares `WEB-005`. |
| League row | PARTIAL | Public league 1 and member/admin league 12 opened. Deleted/forbidden entity not exercised. |
| Find Leagues | PARTIAL | Directory and member/request states rendered at desktop/phone. Mutation failure and pagination not exercised. |
| Create League | NOT EXERCISED | Entry points rendered; create mutation was not performed. |
| Notification bell | PARTIAL | Overlay/tab data and unread counts rendered. Mark-read failure and realtime arrival not exercised. |
| User menu | PARTIAL | Menu opened; logout was run with the logout request aborted. Both tokens and private UI cleared and `/` retained the Navbar. Outside-click/Escape were not completed. |
| Log in / Sign up | FAIL | Both modes opened and origin was retained, but Escape did not close and focus remained in background content (`WEB-005`). Fixture UI login was blocked by `ENV-001`. |
| Feedback | NOT EXERCISED | Entry control rendered; submit/failure/retry matrix was not completed. |
| Global confirmation | PARTIAL | Pickup Submit modal was canceled once, reopened, confirmed once, and persisted after reload. Mutation-error branch was not completed. |
| Share fallback | PARTIAL | Session/KOB share controls rendered; OS/clipboard unavailable branches were not completed. |
| Image lightbox | PARTIAL | Public five-photo gallery route and gallery entry rendered. Next/previous/failed-image keyboard and touch branches were not completed. |

### Anonymous routes

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| `/` | PARTIAL | Landing, video controls, Navbar, Log In, Sign Up, and invalid credentials UI rendered. Provider/rate-limit/API-unavailable branches not completed. |
| Auth modal | FAIL | Login, signup eligibility, Google control, recovery control, and close button rendered. Missing dialog/focus isolation and Escape close (`WEB-005`); real seeded phone login blocked by `ENV-001`. |
| `/courts` | PARTIAL | Populated list, map canvas, cards, authenticated Add Court entry, desktop and phone layouts passed. Geolocation denial, map failure, and mutation errors not completed. |
| `/courts/:slug` | PARTIAL | Breadcrumbs, photos, nearby courts, review form validation, and save-to-My-Courts persistence passed. Full review/edit/delete/upload lifecycle not completed. |
| `/courts/:slug/photos` | PARTIAL | Public gallery and empty-photo court rendered with Navbar. Failed-image and full keyboard/touch matrix not completed. |
| `/find-leagues` | PARTIAL | Anonymous/member render, open/invite-only states, join/request controls, and phone layout passed. Join mutation failure/race not completed. |
| `/find-players` | PARTIAL | Populated directory, canonical profile navigation surface, and phone layout passed. Policy exclusion/error/pagination not completed. |
| `/player/:id` | PARTIAL | `/player/1` canonicalized to `/player/1/patrick-schwagler` and retained Navbar. Invalid ID was not completed. |
| `/player/:id/:slug` | PARTIAL | Public stats/league/match surface rendered. Block/restriction/action-error matrix not completed. |
| `/league/:id` anonymous | PARTIAL | Public rankings, games, awards, details, and auth prompts rendered. Invalid tab/API/private-data branches not completed. |
| `/beach-volleyball` | PARTIAL | Populated location directory rendered with Navbar. Empty/API-error branches were not completed. |
| `/beach-volleyball/:slug` | PARTIAL | Valid `gulf-shores` rendered courts and cross-page links; invalid location rendered Navbar-backed not-found recovery. API-error branch was not completed. |
| `/invite/:token` | PARTIAL | Invalid token rendered explicit `INVALID INVITE` recovery with Navbar. Valid claim/merge branches not completed. |
| `/session/:code` | FAIL | Valid pickup session rendered for a participant, but invalid `notreal` returned 401 then silently redirected to `/` instead of an invalid/deleted recovery state (`WEB-006`). |
| `/kob/:code` | PARTIAL | Invalid code rendered Tournament Not Found. Public score entry succeeded and persisted as intended. Invalid-score, completed-tournament, and realtime-disconnect branches were not completed. |
| Static/legal/support/contribute | PARTIAL | Privacy, terms, community guidelines, support, and contribute all rendered Navbar at desktop and phone width; visible mail/repository controls were present. External-handler failure was not completed. |
| Unknown route / not-found | PASS | Unknown URL rendered Navbar, Page not found, and Go home at desktop and `375×667`. |

### Authenticated dashboard

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| Home | PARTIAL | Populated and empty widgets, entity links, stats, sessions, games, courts, and player rails rendered. Partial widget failure showed raw error under suspended state (`WEB-002`). |
| Profile | PARTIAL | Complete profile form and home-court controls rendered; court save persistence passed. Avatar failures and dirty navigation guard not completed. |
| My Leagues | PARTIAL | Populated member list and empty-state CTAs rendered. Load failure/deleted league not completed. |
| My Games | PARTIAL | Populated session/game navigation and create entry rendered. Empty state rendered for incomplete actor. Error/share failure not completed. |
| My Stats | PARTIAL | Range and ranked/league/partner filters rendered with populated statistics. Sparse/error/long-name branches not completed. |
| Messages | PARTIAL | Two actors became friends; Alice sent a DM and Bob saw the thread/preview. Empty state and disabled empty send passed; send failure, block, and reconnect were not completed, so policy descendants remain unproven. |
| Friends | PARTIAL | Incoming request acceptance persisted across simultaneous Alice/Bob sessions and both saw the friendship. Decline/cancel/unfriend/rollback/policy matrix not completed. |
| Pending Invites | PARTIAL | Populated placeholder invite and empty actor surfaces rendered. Claim/delete/share failures not completed. |
| Notifications | PARTIAL | Populated list, inline friend actions, read controls, and unread navigation rendered. Failure/dedupe/realtime matrix not completed. |
| More menu | FAIL | At `390×844`, all six hidden destinations were reachable and no overflow occurred, but Escape did not close the menu (`WEB-005`). |
| Dashboard-level guards | FAIL | Signed-out `/home` redirected safely and incomplete profile modal rendered. Invalid `?tab=bogus` produced an empty dashboard (`WEB-003`); offline tab navigation replaced the app with `chrome-error://chromewebdata/` (`WEB-004`); suspended actor bypassed the restricted entry screen (`WEB-002`). |

### Authenticated league app

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| Header/menu | PARTIAL | League selection, six tabs, and URL synchronization worked for league 12. Rename/error/bad-tab matrix not completed. |
| Rankings | PARTIAL | Populated long table and season selector rendered. Failure/tie-specific assertions not completed. |
| Games | PARTIAL | Cards/table, existing sessions/games, Add Games, and upload entry rendered. Full edit/delete/photo/rollback/concurrency matrix not completed. |
| Awards | PARTIAL | Active-season No Awards Yet state rendered. Finalization/unauthorized failure not completed. |
| Details | FAIL | Admin saw join requests, players, roles, seasons and admin controls; normal member saw only Leave. A season without a valid end date rendered `12/31/1969` (`WEB-007`). Boundary mutations were not completed. |
| Sign Ups | PARTIAL | Upcoming, past signup, and weekly schedule states plus admin create controls rendered. Capacity/error/permission mutations not completed. |
| Messages | PARTIAL | Empty send was disabled; an admin sent a chronological league message and it persisted after reload. Policy/send-failure branches were not completed. |
| Join prompt | PARTIAL | Open/invite-only/current-member/request UI states rendered. Join/request mutations and policy 409 were not completed. |

### Pickup session app

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| Session header | PARTIAL | Creator header, share, rename/delete entries, cancel/confirm surfaces and submitted state rendered. Non-creator/error branches not completed. |
| Players drawer | PARTIAL | At desktop and phone-compatible layout, Alice added three participants through search; roster reached four and fed score entry. Duplicate/full/removal failure not completed. |
| Games | PARTIAL | Created a valid `21–15` game, reloaded it, and verified four roster choices. Empty-player validation showed an actionable alert and Cancel preserved prior data. Mutation failure not completed. |
| Lifecycle | PARTIAL | Submit was canceled, then confirmed once; ended state and game survived reload. Duplicate/new/deleted and server-failure branches not completed. |
| Invite link | NOT EXERCISED | Invite control rendered; auto-join and boundary matrix were not completed. |

### KOB app

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| `/kob/create` | PARTIAL | Authenticated create UI, recommendations, settings, preview, validation focus, and creation of tournament 7 passed. Native confirm automation required an in-page confirmation override to continue. Create failure not completed. |
| `/kob/manage/:id` | PARTIAL | Director added seven players, start remained disabled at zero, then enabled and generated an active tournament/code. Reorder/delete/unauthorized/concurrency branches not completed. |
| `/kob/:code` | PARTIAL | Public tabs and live state rendered; public score mutation succeeded and persisted as intended. Standings, realtime, invalid-score, and concurrent-score branches remain unexercised. |

### System admin app

| Flow-map row | Result | Recorded evidence / missing branch |
| --- | --- | --- |
| Access gate | PARTIAL | Anonymous received Sign in to continue; non-admin received Access denied; system admin entered. Revocation during an open session not completed. |
| Dashboard | PARTIAL | Platform counts, recent players, include-unregistered control, and refresh rendered. Partial/empty failure not completed. |
| Courts | PARTIAL | New/suggestion/directory modes and a pending Review submission rendered. Moderation/photo/review mutations and failure/concurrency branches not completed. |
| Moderation | PARTIAL | Overview counts, filters, search, and closed cases rendered. Case action/evidence/retry mutations not completed. |
| Users | PARTIAL | Search, three filters, pagination, history, and grant/revoke controls rendered. No role mutation was made; safety/concurrency/failure paths not completed. |
| Feedback | PARTIAL | Feedback tab, search, and unresolved filter rendered. Resolve mutation/error/empty branches not completed. |
| Settings / WhatsApp | PARTIAL | SMS/email toggles, log level, and disabled-until-dirty Save rendered without exposing secrets. WhatsApp service controls were not exposed in this local state; connection/send failures were not completed. |

## Responsive, persistence, accessibility, and failure-state summary

| Dimension | Result |
| --- | --- |
| Desktop | Public, dashboard, league, pickup, KOB, and admin core surfaces rendered at `1440×900`. |
| `390×844` | Dashboard and More menu rendered without horizontal overflow; More Escape failure is `WEB-005`. |
| `375×667` | Home, courts, find leagues, league details, submitted session, privacy, not-found, and auth overlay rendered without horizontal overflow. |
| Persistence | Pickup roster/game/submission, friendship, DM, league message, court save, KOB create/start, and public KOB score persisted as expected. |
| Accessibility | Navbar had an accessible navigation label. Auth overlay lacked dialog semantics/focus isolation; background focus remained active. Escape failures affected auth and More (`WEB-005`). |
| Offline/reconnect | Offline dashboard tab navigation escaped to Chromium's network-error page instead of retaining app recovery UI (`WEB-004`). Reconnect reconciliation was therefore not trusted. |
| Mutation failure | Aborted logout still cleared tokens/private UI. Most domain-specific rollback branches remain unexercised and are explicitly PARTIAL above. |
| Console/network | Expected invalid-location/session failures were observed. Repeated development WebSocket errors were not filed as product defects. |

## Deduplicated defects

### WEB-002 — P0 — Suspended account bypasses restricted entry screen

- Route/journey: `/home`, account-enforcement guard.
- Actor/state: authenticated local fixture temporarily set to `suspended`.
- Viewport: desktop `1440×900`.
- Expected: restricted entry screen exposes only allowed recovery actions and
  blocks private destinations.
- Actual: the dashboard, private navigation, league/game/profile actions and a
  synthetic `? Player` identity rendered; My Sessions displayed raw
  `Request failed with status code 403`.
- Evidence: `docs/artifacts/e2e-web-2026-08-13/suspended-account-dashboard.png`.
- Blocked descendants: appeal/deletion recovery and restricted interaction
  policy UI are **BLOCKED — WEB-002**.

### WEB-003 — P1 — Invalid dashboard tab renders an empty dashboard

- Route: `/home?tab=bogus`; authenticated member.
- Expected: fall back to Home.
- Actual: Navbar/sidebar/footer rendered, but the dashboard content area was
  empty and URL retained the invalid tab.

### WEB-004 — P1 — Offline tab navigation leaves the application

- Route/journey: authenticated `/home?tab=messages` to Friends while offline.
- Expected: retain app shell/prior data and render actionable offline/retry UI.
- Actual: navigation ended at `chrome-error://chromewebdata/` with no Navbar or
  app recovery UI.

### WEB-005 — P1 — Overlays lack required keyboard/dialog behavior

- Routes: `/` auth modal and `/home` More menu at phone width.
- Expected: modal receives focus, uses dialog semantics, traps background
  focus, Escape closes, and focus returns to the trigger.
- Actual: auth overlay had no dialog role, focus remained on the background Log
  In button, Tab moved to background Sign Up, and Escape did not close. Escape
  also did not close More (focus remained on More).
- Evidence: `docs/artifacts/e2e-web-2026-08-13/auth-modal-focus-375x667.png`.

### WEB-006 — P1 — Invalid session code silently redirects home

- Route: `/session/notreal`; anonymous.
- Expected: invalid/deleted session recovery UI with Navbar.
- Actual: two 401 load errors were logged and the browser silently landed on
  `/`, losing the reason and retry/recovery context.

### WEB-007 — P2 — Missing league season end date renders Unix epoch

- Route: `/league/12?tab=details`; member and league admin.
- Expected: an omitted/open-ended date or no end date.
- Actual: Catalog Summer 2026 displayed an end date of `12/31/1969`.

## Environment blocker

### ENV-001 — Local seeded phone accounts fail web validation

`make seed-users` documents three manual accounts using reserved `+1 555…`
numbers. The real login form reports `Invalid phone number` before issuing an
auth request. The run used `make dev-login` to continue other authenticated
coverage. Password-login success through the real UI is therefore unproven by
this run.

## Accepted behavior

### Public KOB score entry

An anonymous user submitted a live KOB score and the result persisted after
reload. The product owner confirmed this is intended behavior, so it is not
tracked as `WEB-001` and does not block KOB coverage. The redacted screenshot is
retained as positive persistence evidence.

## Artifacts

- `docs/artifacts/e2e-web-2026-08-13/auth-modal-focus-375x667.png`
- `docs/artifacts/e2e-web-2026-08-13/kob-anonymous-score-mutation.png`
- `docs/artifacts/e2e-web-2026-08-13/suspended-account-dashboard.png`

Artifacts contain only local fixture/product UI. Credential-like values and
tokens were not captured.

## Portions not exercised

The row table intentionally calls these out as PARTIAL or NOT EXERCISED. The
largest remaining areas are Google/SMS/OTP provider failure, valid invite
claim/merge, full review/photo/suggest-edit lifecycle, league create/role/sole
admin boundaries, session auto-join, mutation rollback across most domains,
block/restrict policy in both directions, realtime disconnect/reconnect,
concurrent admin/KOB edits, destructive admin actions, WhatsApp operations,
clipboard/OS external-link failures, reduced motion, large text, and native
browser confirmation automation. Chromium-only evidence must not be read as
Firefox, WebKit, or native-mobile coverage.

Because mapped cases remain failed, blocked, partial, or unexercised, no web
sign-off is granted.
