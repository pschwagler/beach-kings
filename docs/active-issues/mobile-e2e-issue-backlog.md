# Mobile E2E Issue Backlog

Last verified: July 18, 2026
Platform: iOS simulator, iPhone 17 Pro
App: Beach League (`com.beachleague.app`)

## Purpose

This document tracks issues found during exploratory mobile E2E testing. The work is grouped into bounded tasks that can be assigned independently to coding agents. The July 12 audit did not cover accessibility; the July 16 follow-up includes accessibility findings verified by comparing rendered screenshots with the simulator accessibility tree.

Agents must preserve existing database data. Do not reset, recreate, or delete database state while reproducing these issues. Use existing seeded/test accounts and avoid sending real messages, accepting friend requests, or submitting games unless a test fixture explicitly isolates those mutations.

## Suggested execution order

1. Task A: Friendship and notification consistency
2. Task B: League season consistency
3. Task C: Home and profile freshness
4. Task D: Messaging behavior
5. Task E: UI cleanup and empty states (complete)

Tasks A through D can run independently after shared test fixtures are understood. Task E should follow the functional fixes so its snapshots are based on stable screens.

## Task A — Make friendship and social notifications consistent

Priority: P1
Scope: Friendship state, social queries, notification deduplication

### Issues

1. A player listed under **My Friends** can show an **Add Friend** button on their profile.
2. Existing friends can still have notifications saying they sent a friend request.
3. Notifications can contain multiple identical friend-request entries from the same player.
4. The mutual-friend section can display only a `?` placeholder instead of a usable friend identity.

### Reproduction

1. Open **Social → Friends** and note a player in **My Friends**.
2. Open that player's profile and observe that **Add Friend** may be offered.
3. Open **Social → Notifications → All** and inspect friend-request entries.
4. Open a player profile with mutual friends and inspect the mutual-friend row.

### Root-cause findings

Two causes are direct and narrowly scoped:

- **Incorrect friend status on player profiles:** `usePlayerProfileScreen.ts` treats `batchFriendStatus()` as a flat map and looks up `response[playerId]`. The backend actually returns `{ statuses, mutual_counts }`, and its status values are `friend`, `pending_outgoing`, or `pending_incoming`. The hook also checks for the different values `friends` and `pending`. Every real relationship therefore falls through to `none`, which renders **Add Friend**.
- **Bare `?` mutual friend:** `/api/friends/mutual/{id}` returns `{ player_id, full_name, avatar }`, while the shared `FriendInLeague` type and `PlayerMutualFriends.tsx` read `first_name`. Because `first_name` is absent, the component deliberately falls back to `?` and an empty label.

The repeated/obsolete notification rows are not reduced to one narrow cause. The backend creates a new notification for each new friend-request row, while declined requests may be deleted and later re-sent. Current accept/decline paths mark matching notifications read, but the **All** feed still includes historical read rows. Determining whether the observed entries are valid history, legacy rows from before cleanup behavior, or true duplicate active requests requires fixture-level inspection. Keep notification deduplication/history semantics as part of the broader task.

### Agent deliverables

- Use exactly five relationship states across the API and mobile app: `self`,
  `none`, `friend`, `pending_outgoing`, and `pending_incoming`. Relationship
  payloads also carry the canonical pending `request_id` when one exists.
- Render the same state consistently in Friends, discovery, player profiles,
  notifications, badges, pull-to-refresh, and a full app relaunch.
- A confirmed friend never sees **Add Friend**. An incoming request shows
  **Accept** and **Decline** on the player profile. Discovery rows stay compact:
  incoming requests show **Request received** without inline actions and outgoing
  requests show **Request sent**.
- Allow only one notification to represent an active friend request. When a
  request is accepted, declined, cancelled, or superseded, hide its obsolete
  notification while retaining both request and notification history in storage.
- Render every mutual friend with their avatar and name. Use `Player <id>` as the
  final identity fallback; never render a bare `?`.
- Add API and mobile tests around pending, accepted, declined, cancelled,
  concurrent, superseded, and stale relationships.

### Starting implementation status

Partial progress already exists for profile response mapping, the mutual-friend
API type, notification dismissal, and legacy notification reconciliation. Those
fixes are necessary but do not yet make the domain consistent.

The work identified as still needed at the start of Task A was the shared mobile cache, reusable friendship mutations,
discovery status correction, profile response actions, notification hydration,
cancellation synchronization, concurrency protection, and safe additive E2E
fixtures.

### Delivery status — July 18, 2026

The remaining Task A implementation above is now present in the repository:
social and notification data use user-scoped Query keys; shared mutations own
optimistic updates and rollback; discovery/profile controls use the five-state
presentation contract; notification hydration and WebSocket upsert share one
cache; backend relationship, history, concurrency, and deduplication invariants
are covered by migration 058; and the social E2E setup is additive and
run-scoped.

Migration 058 intentionally performs a read-only duplicate-pending audit and
aborts before schema changes if recovery approval is needed. Apply it in each
environment before deploying backend code that reads `notifications.dedup_key`.

Task A is the first working example of the mobile data-state direction documented
in [`apps/mobile/docs/data-state.md`](../../apps/mobile/docs/data-state.md). It is
a bounded social/notification pilot, not an app-wide rewrite.

### Acceptance criteria

- A confirmed friend never receives an **Add Friend** action.
- Incoming requests can be accepted or declined on the profile; discovery only
  reports that the request was received.
- Outgoing requests consistently say **Request sent**.
- A pending request has one actionable notification representation, not repeated
  duplicates.
- Accepted or obsolete requests cannot appear as new actionable requests.
- Mutual-friend entries use the shared avatar and a stable name fallback that
  identifies the player; a bare `?` is not shown.
- Friends, Profile, discovery, Notifications, badges, refresh, and relaunch agree
  on relationship state.

### Delivery and test safety

Backend coverage must include all five relationship states, reverse and
concurrent requests, accept-versus-decline races, re-requesting, cancellation,
legacy duplicates, and notification dismissal. Mobile coverage must include
shared-cache optimistic updates and rollback, profile inline response, discovery
labels, notification hydration/upsert, logout cache isolation, and mutual identity
fallback.

Do not reuse the current social E2E setup unchanged when it deletes existing
relationships. Social E2E must create uniquely named, run-scoped fixture users
and use additive setup only. It must not use real users, send real messages,
reset or truncate a database, delete existing relationships, or clean up shared
records.

## Task B — Keep current league season selection consistent

Priority: P2
Scope: League season presentation, standings selection, game creation

### Issues

1. A league can display two seasons marked **Active** simultaneously.
2. Standings can default to one active season while **Add Game** associates the league with the other active season.

### Reproduction

1. Open a league with multiple seasons.
2. Select **Standings** and inspect the season chips; two may be marked **Active**.
3. Note the season selected by default.
4. Start **Add Games → League Game** for the same league.
5. Compare the season shown in the league selection/game flow with the Standings selection.

### Root-cause findings

The observed inconsistency came from two different read rules:

- `list_seasons()` computed `is_active` independently for every season whose date range contains today. Overlapping finite date ranges could therefore produce multiple seasons labeled **Active**.
- Migration `051_seasons_one_open_per_league.py` prevents multiple seasons with `end_date IS NULL`, but it does not prevent overlapping finite seasons, so it does not enforce the broader "one active today" invariant.
- Standings and player stats initialized to the first season returned by `list_seasons()`, which is ordered by `start_date DESC`. League detail and automatic game/session creation use the canonical resolver, which orders qualifying seasons by `created_at DESC`. When ranges overlap, those independent rules could select different seasons.

### Scope decision — July 18, 2026

Overlapping season ranges remain legal. Prohibiting them would require a broader
product decision, concurrency enforcement, legacy-data recovery, and administrator
workflow changes that are not justified by this presentation edge case. This task
therefore aligns current-season reads without adding a migration, rejecting season
updates, or rewriting historical dates.

### Agent deliverables

- Mark only the canonical resolver's winner `is_active` in the seasons list.
- Use a deterministic `created_at DESC, id DESC` tie-break everywhere the
  canonical current season is selected.
- Make Standings and player stats prefer the canonical active season while
  retaining the existing newest-season and all-time fallbacks.
- Add backend and mobile tests for zero, one, and legacy-overlapping seasons.

### Delivery status — July 18, 2026

Implemented without schema or data changes. The existing overlapping-season
simulator fixture now shows one **Active** season in Info, and Standings opens on
that same season. Season creation and update behavior is intentionally unchanged.

### Acceptance criteria

- At most one season per league is labeled **Active** by the API and mobile UI.
- Standings, player stats, and automatic game/session attribution prefer the same
  canonical season.
- When no season is active, existing newest-season and all-time fallbacks remain.
- Legacy overlaps are handled deterministically without changing stored dates.

## Task C — Fix stale Home and transient Profile data

Priority: P1
Scope: Query invalidation, startup hydration, retry behavior

### Issues

1. Home initially showed a different win/loss record than Profile; relaunch corrected Home.
2. An active-session card was present before relaunch and disappeared after relaunch.
3. Returning from Settings briefly showed **Could not load your profile**; immediate retry succeeded.

### Reproduction

1. Launch into Home and record the displayed W-L value and active-session state.
2. Open Profile and compare its W-L value.
3. Navigate **Profile → Settings → Back** and watch the Profile load state.
4. Relaunch the app and compare Home values and active-session state again.

### Root-cause findings

The inconsistent refresh behavior is explained by two separate data systems:

- Home uses TanStack Query through `useCurrentPlayer()` and `useDashboard()`. Queries are considered fresh for 30 seconds, do not refetch on window focus, and retain cache entries for five minutes.
- Profile bypasses that shared query and calls `api.getCurrentUserPlayer()` through the local-state `useApi()` hook. It therefore can show newer player stats while Home continues showing a fresh-but-older cached player.
- Relaunch creates a new `QueryClient`, clearing the in-memory Home cache and explaining why the values converge after relaunch.
- The active-session query uses the same dashboard cache policy, so it can retain a session response until invalidation, expiry, or relaunch.
- Returning to Profile remounts its uncached `useApi()` request. Any transient failure replaces the whole screen with the error state even if another part of the app still has valid current-player data cached under `['private', userId, 'player', 'me']`.

The cache split is confirmed, but which mutations fail to invalidate player and active-session data requires tracing all session submission/auto-submission paths. Keep that portion of the task broad.

### Agent deliverables

- Trace cached versus server-derived stats and active-session queries.
- Ensure relevant mutations and navigation transitions invalidate or refresh dependent queries.
- Prevent a recoverable background refresh from replacing valid cached profile content with a full-screen error.
- Add tests for cold launch, warm navigation, retry, and post-mutation refresh.

### Acceptance criteria

- Home and Profile display the same record from the same authoritative data state.
- Active-session visibility does not change merely because the app was relaunched.
- Returning from Settings retains valid Profile content while refreshing.
- Genuine failures provide Retry; successful cached data is not discarded unnecessarily.

## Task D — Correct messaging read state and composer interaction

Priority: P1
Scope: Direct messages, league chat, keyboard/navigation interaction

### Issues

1. Opening an unread direct-message thread does not clear its unread notification.
2. With the league-chat keyboard open, attempting to switch to **Info** failed to navigate and appended unexpected characters to the message draft.

### Reproduction

#### Unread state

1. Open **Social → Messages** and select a conversation marked unread.
2. Return to **Social → Notifications**.
3. Observe that the unread-message notification can remain unread.

#### Composer/navigation

1. Open a league and select **Chat**.
2. Focus the composer and type a disposable draft without sending it.
3. Attempt to select **Info** while the keyboard remains open.
4. Observe whether navigation occurs and whether the draft changes unexpectedly.

### Root-cause findings

- **Unread notification:** `useMessageThreadScreen.ts` fetches the thread but never calls `api.markThreadRead(playerId)`. The backend endpoint and notification reconciliation already exist: `mark_thread_read()` updates the messages and then updates or dismisses the direct-message summary notification. The missing mobile invocation is the direct cause.
- **Composer/tab interaction:** no code path was found that intentionally appends tab-label characters. The league segment control directly calls `onSetTab()`, while the composer is controlled only by its `TextInput`. The observed draft mutation may depend on keyboard responder behavior or the automation selector targeting the tab's text node while the input remains focused. Leave this generalized until it reproduces with a manual tap or a coordinate/ref-based device test.

### Agent deliverables

- Consolidate conversation-read state and related notification state.
- Ensure opening/reading a thread updates all unread counters and notification surfaces.
- Fix keyboard responder or tab-press handling so navigation cannot type into the composer.
- Preserve or intentionally discard drafts according to an explicit navigation rule.
- Add interaction tests for unread transitions and composer-focused tab changes.

### Acceptance criteria

- Opening a thread marks it read everywhere after synchronization.
- Message-list dots, notification rows, and aggregate counts agree.
- Selecting another league tab while the composer is focused navigates exactly once.
- Navigation never inserts characters into the draft.
- No test sends a real message unless it uses an isolated fixture.

## Task E — Polish duplicated and empty UI states

Priority: P2
Scope: League detail and game-history presentation

### Status

Complete. The duplicated league title, empty league chat, and score formatting
inconsistencies were fixed. The shared score formatter remains in use on the
mobile surfaces that depend on it.

## July 16 follow-up audit — simulator issue checklist

Status: 15 open

This follow-up exercised Home, Social, league discovery and detail, session management, game setup and scoring, Profile, Settings, notifications, and theme switching across 35 captured simulator states. Each issue below was reproduced in the iOS simulator and, where possible, cross-checked against the implementation.

Testing created one empty active league session through the **Manage Session** flow. It remains in place because repository safety rules prohibit deleting database records. The unsaved pickup-game draft was discarded and the theme was restored to **System**.

### Summary

| ID | Severity | Area | Issue | Status |
| --- | --- | --- | --- | --- |
| BK-IOS-001 | High | League discovery | Join request surfaces an unhandled Axios 400 | [ ] Open |
| BK-IOS-002 | High | Sessions | Share Session is a no-op | [ ] Open |
| BK-IOS-003 | High | Sessions | Manage Players → Add Player is a no-op | [ ] Open |
| BK-IOS-004 | Medium | Home | Tournaments is a prominent placeholder | [ ] Open |
| BK-IOS-005 | High | Scoring | A tied game can still be submitted | [ ] Open |
| BK-IOS-006 | Medium | Scoring | A registered player can be labeled as a guest | [ ] Open |
| BK-IOS-007 | Medium | Sessions | Newly created session can display the next calendar day | [ ] Open |
| BK-IOS-008 | Medium | Sessions | Manage Session silently persists an empty session | [ ] Open |
| BK-IOS-009 | Medium | Add Games | Enabled Add Game buttons look disabled | [ ] Open |
| BK-IOS-010 | Medium | Accessibility | Notification switches are named only `1` or `0` | [ ] Open |
| BK-IOS-011 | Medium | Accessibility | Text fields expose internal test IDs as names | [ ] Open |
| BK-IOS-012 | Medium | Accessibility | Chat send target is only 28×28 points | [ ] Open |
| BK-IOS-013 | Medium | Accessibility | Find Leagues actions lack button semantics | [ ] Open |
| BK-IOS-014 | Medium | Accessibility | Session actions lack button semantics | [ ] Open |
| BK-IOS-015 | Low | Profile | Read-only profile values look editable | [ ] Open |

### BK-IOS-001 — Handle league join-request failures

Severity: High

Suggested owner: League discovery/API integration

- [ ] Catch join-request failures without rethrowing an unhandled promise.
- [ ] Roll back the optimistic `requested` state on failure.
- [ ] Show a user-facing error with a retry path where appropriate.
- [ ] Verify the error surface disappears when navigating away.
- [ ] Add coverage for 400, 403, duplicate-request, offline, and success responses.

Reproduction:

1. Open **Leagues → Find Leagues**.
2. Tap **Request to Join** on an available public league.
3. Observe the developer-facing `AxiosError: Request failed with status code 400` toast.
4. Navigate back and observe that the error toast persists.

Likely implementation: `apps/mobile/src/components/screens/Leagues/useFindLeaguesScreen.ts`; its catch path invalidates the query and then rethrows the error.

Acceptance criteria: A rejected request never exposes an unhandled-promise or Axios message. The card returns to a valid state and the user receives actionable, product-level feedback.

### BK-IOS-002 — Implement Share Session

Severity: High

Suggested owner: Sessions/backend integration

- [ ] Generate or retrieve a stable session invitation.
- [ ] Open the native share sheet or provide a clearly confirmed copy action.
- [ ] Handle unavailable share data and API failures.
- [ ] Add component and simulator coverage.

Reproduction: Open an active session, open the overflow menu, and tap **Share Session**. The sheet closes and nothing else happens.

Confirmed source finding: `SessionBottomSheet.tsx` contains `TODO(backend): generate and copy share link` in `handleShare()`.

Acceptance criteria: Tapping Share Session produces a shareable session invitation or a clear error; it never silently closes.

### BK-IOS-003 — Implement Manage Players → Add Player

Severity: High

Suggested owner: Sessions/roster management

- [ ] Open a player-search or invitation surface from **Add Player**.
- [ ] Support adding a valid player and returning to the updated roster.
- [ ] Handle duplicates, full sessions, and API failures.
- [ ] Preserve the empty-state layout while loading or failing.

Reproduction: Open an empty active session, choose **Manage Players**, and tap **Add Player**. The screen does not change.

Confirmed source finding: `useSessionRosterScreen.ts` contains `TODO(backend): open player search sheet` in `onAddPlayer()`.

Acceptance criteria: Add Player always opens a usable flow, and a successful addition appears in the roster without relaunching.

### BK-IOS-004 — Replace or remove the home Tournaments placeholder

Severity: Medium

Suggested owner: Home/Tournaments

- [ ] Decide whether tournament discovery is ready for the Home surface.
- [ ] Link the section to real tournament content, or remove/collapse it until it is actionable.
- [ ] Avoid reserving prime Home space for a non-interactive dashed placeholder.

Reproduction: Open Home and scroll below **My Leagues**. The Tournaments section says “Coming soon to a beach near you” and “KoB events and brackets are on the way.”

Acceptance criteria: The section either provides a real tournament action/content state or is absent from production Home.

### BK-IOS-005 — Block invalid tied games

Severity: High

Suggested owner: Scoring/domain validation

- [ ] Make a tied score fail `canSubmit`.
- [ ] Render Save Game in a visibly and semantically disabled state while tied.
- [ ] Enforce the same rule at the API/domain boundary.
- [ ] Add tests for 0–0, tied scores, incomplete scores, valid scores, and win-by-two rules.

Reproduction:

1. Start a pickup game and select four players.
2. Enter `21–21`.
3. Observe “Scores are tied — beach volleyball has no ties.”
4. Observe that the gold **Save Game** button remains enabled.

Acceptance criteria: A tied game cannot be submitted from mobile or directly through the API, and the UI clearly communicates how to correct it.

### BK-IOS-006 — Keep registered-player and guest identity consistent

Severity: Medium

Suggested owner: Scoring/player search

- [ ] Trace `is_guest` from player search results through roster assignment.
- [ ] Ensure registered players never inherit placeholder/guest state.
- [ ] Verify saved attribution, invitation prompts, avatars, and stats behavior.
- [ ] Add a test with one registered player and one newly created placeholder.

Reproduction: Select an existing registered/shared-league player from **More Players**. After all four slots are filled, the scoreboard can append “(guest)” to that player.

Acceptance criteria: Only placeholders created through the guest-player flow are marked as guests, on screen and in submitted payloads.

### BK-IOS-007 — Use the local calendar date for new sessions

Severity: Medium

Suggested owner: Sessions/date handling

- [ ] Trace session date defaults across client, API, and backend serialization.
- [ ] Separate date-only values from UTC timestamps.
- [ ] Test creation before and after UTC midnight in multiple time zones.

Reproduction: On July 16 in the simulator's local time zone, create a session through **Manage Session**. The resulting active session displays July 17.

Acceptance criteria: A session created for “today” displays the same local calendar date before and after persistence and relaunch.

### BK-IOS-008 — Make implicit empty-session creation explicit

Severity: Medium

Suggested owner: Scoring/Sessions UX

- [ ] Decide whether Manage Session should create a server record before any game is saved.
- [ ] If required, communicate that creation is occurring and provide a safe draft lifecycle.
- [ ] Prevent abandoned empty sessions from accumulating indefinitely.
- [ ] Do not solve this with destructive cleanup or database resets.

Reproduction: Begin a new league game, open the score-game menu, and choose **Manage Session** before selecting players or saving a game. An active zero-player, zero-game session is persisted.

Acceptance criteria: Users understand when a persistent session is created, and abandoning game setup does not silently create unexplained active sessions.

### BK-IOS-009 — Correct enabled Add Game styling

Severity: Medium

Suggested owner: Add Games/design system

- [ ] Style enabled league-selection actions using the normal primary or secondary action tokens.
- [ ] Reserve gray/low-emphasis treatment for actual disabled state.
- [ ] Verify text contrast in system, light, and dark themes.

Reproduction: Open **Add Games → League Game**. Each tappable **Add Game** control appears dark gray with dark text, resembling a disabled button.

Acceptance criteria: Enabled and disabled states are immediately distinguishable and meet contrast requirements.

### BK-IOS-010 — Give notification switches descriptive accessibility labels

Severity: Medium

Suggested owner: Settings/accessibility

- [ ] Associate every switch with its visible row label.
- [ ] Preserve the switch role and checked state.
- [ ] Verify disabled child switches communicate why they are unavailable.

Reproduction: Inspect **Settings → Notification Preferences** with the accessibility tree. Switches are named only `1` or `0` instead of “Push Notifications,” “Chat Messages,” and the other visible labels.

Acceptance criteria: VoiceOver announces each setting name, switch role, and on/off state.

### BK-IOS-011 — Replace internal text-field names with user-facing labels

Severity: Medium

Suggested owner: Forms/accessibility

- [ ] Add explicit accessibility labels to the Create League name field and score-game roster search.
- [ ] Audit other mobile inputs for test IDs exposed as accessible names.
- [ ] Keep test IDs available for automation without using them as product copy.

Reproduction: Inspect the Create League form and scorer roster search. The tree exposes `league-name-input` and `roster-search-input`.

Acceptance criteria: Inputs announce concise user-facing names such as “League name” and “Search players,” while automation selectors remain stable.

### BK-IOS-012 — Increase the chat send touch target

Severity: Medium

Suggested owner: Messaging/accessibility

- [ ] Provide at least a 44×44-point interactive hit area.
- [ ] The visible icon may remain smaller if the Pressable hit area is expanded.
- [ ] Verify composer layout with large text and the keyboard open.

Confirmed source finding: `ChatComposer.tsx` sets the send Pressable to `w-[28px] h-[28px]`.

Acceptance criteria: The send action has a minimum 44×44-point target without crowding or clipping the composer.

### BK-IOS-013 — Expose Find Leagues actions as buttons

Severity: Medium

Suggested owner: League discovery/accessibility

- [ ] Give **View League** and **Request to Join** explicit button semantics and labels.
- [ ] Resolve nested Pressable behavior so the card and inner action are independently understandable.
- [ ] Expose loading and disabled state while a request is pending.

Reproduction: Inspect **Find Leagues** using the accessibility tree. The card and visible action are exposed as generic elements rather than actionable buttons.

Acceptance criteria: VoiceOver can focus the intended action, announces its purpose and state, and activates it exactly once.

### BK-IOS-014 — Expose session actions as buttons

Severity: Medium

Suggested owner: Sessions/accessibility

- [ ] Add roles and labels to session-sheet items: Edit, Manage Players, Share, Delete, and Cancel.
- [ ] Add roles and labels to the sticky **Add Game** and **Submit Session** controls.
- [ ] Verify destructive and disabled states are announced.

Reproduction: Inspect an active session and its overflow sheet. The visible action rows and sticky CTAs appear as generic elements in the accessibility tree.

Acceptance criteria: Every session action is individually focusable and announced with the correct role, label, and state.

### BK-IOS-015 — Clarify that Profile details are read-only

Severity: Low

Suggested owner: Profile/design

- [ ] Replace input-like bordered boxes with a read-only detail treatment, or add a clear Edit Profile action.
- [ ] Normalize display formatting such as capitalizing the preferred side.
- [ ] Preserve readable grouping for long or missing values.

Reproduction: Open Profile. Personal details render inside input-like bordered fields, but they cannot be focused or edited and there is no nearby edit action.

Acceptance criteria: Users can immediately distinguish read-only information from editable fields and can discover the intended edit path.

## Verification checklist for every task

- Run focused unit/component tests for changed files.
- Run the relevant mobile test suite.
- Verify the affected flow with `agent-device` on an iPhone simulator.
- Re-check system, light, and dark themes for visual changes.
- Confirm no unrelated records, messages, relationships, sessions, or games were mutated.
- Record any remaining issue in this document rather than broadening the assigned task silently.

## Completion tracking

| Task | Owner | Status | PR/Commit | Verified |
| --- | --- | --- | --- | --- |
| A — Friendship consistency | Unassigned | Implemented; verification pending | — | — |
| B — Current season consistency | Codex | Complete | — | iOS simulator, July 18 |
| C — Home/Profile freshness | Unassigned | Not started | — | — |
| D — Messaging behavior | Unassigned | Not started | — | — |
| E — UI cleanup | Unassigned | Not started | — | — |
