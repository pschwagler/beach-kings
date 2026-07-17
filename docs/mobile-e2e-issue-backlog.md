# Mobile E2E Issue Backlog

Last verified: July 12, 2026
Platform: iOS simulator, iPhone 17 Pro
App: Beach League (`com.beachleague.app`)

## Purpose

This document tracks issues found during exploratory mobile E2E testing. The work is grouped into bounded tasks that can be assigned independently to coding agents. Accessibility is intentionally out of scope for this audit.

Agents must preserve existing database data. Do not reset, recreate, or delete database state while reproducing these issues. Use existing seeded/test accounts and avoid sending real messages, accepting friend requests, or submitting games unless a test fixture explicitly isolates those mutations.

## Suggested execution order

1. Task A: Friendship and notification consistency
2. Task B: League season consistency
3. Task C: Home and profile freshness
4. Task D: Messaging behavior
5. Task E: UI cleanup and empty states

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

- Establish one canonical friendship-state mapping for lists, profiles, and notifications.
- Prevent duplicate active/presented friend-request notifications for the same request or relationship.
- Decide how obsolete request notifications should render after a relationship becomes accepted.
- Resolve mutual-friend display data or provide a deliberate fallback with a stable identity.
- Add API and mobile tests around pending, accepted, declined, and stale relationships.

### Acceptance criteria

- A confirmed friend never receives an **Add Friend** action.
- A pending request has one actionable representation, not repeated duplicates.
- Accepted or obsolete requests cannot appear as new actionable requests.
- Mutual-friend entries show a name/avatar fallback that identifies the player; a bare `?` is not shown.
- Refresh and relaunch preserve the same relationship state across Friends, Profile, and Notifications.

## Task B — Enforce a single active league season

Priority: P1
Scope: League seasons, standings selection, game creation

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

This is a domain-model consistency issue rather than a single UI bug:

- `list_seasons()` computes `is_active` independently for every season whose date range contains today. Overlapping finite date ranges can therefore produce multiple seasons labeled **Active**.
- Migration `051_seasons_one_open_per_league.py` prevents multiple seasons with `end_date IS NULL`, but it does not prevent overlapping finite seasons, so it does not enforce the broader "one active today" invariant.
- Standings initializes to the first season returned by `list_seasons()`, which is ordered by `start_date DESC`. League detail/game creation use `current_season_id` from the canonical resolver, which orders qualifying seasons by `created_at DESC`. When ranges overlap, those independent ordering rules can select different seasons.

Because resolving existing overlaps and defining valid future season transitions affect backend rules, migrations, and administrator workflows, the implementation remains intentionally generalized below.

### Agent deliverables

- Define and enforce the invariant for active seasons at the API/domain layer.
- Ensure Standings and Add Game use the same canonical current-season selection.
- Handle legacy data containing multiple active seasons without deleting or resetting data.
- Add backend and mobile tests for zero, one, and legacy-multiple active seasons.

### Acceptance criteria

- New updates cannot leave more than one active season per league.
- The mobile app identifies the same current season in Standings and game creation.
- Legacy ambiguous state is handled deterministically and surfaced safely for correction.
- No database reset, destructive migration, or silent historical deletion is used.

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
- Returning to Profile remounts its uncached `useApi()` request. Any transient failure replaces the whole screen with the error state even if another part of the app still has valid current-player data cached under `['player', 'me']`.

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

### Issues

1. League detail repeats the league title in both the navigation bar and body header.
2. Empty league chat presents a blank area with no explanatory empty state.
3. Score typography differs between screens, for example `21-15`, `21 - 15`, and `21 – 15`.

### Reproduction

1. Open any league detail screen and compare the navigation title with the body header.
2. Select an empty league **Chat** tab.
3. Compare scores on Home, My Games, and league game cards.

### Root-cause findings

All three issues are direct component-level inconsistencies:

- `LeagueDetailScreen.tsx` passes the league name to `TopNav` and immediately renders `LeagueHeader` with the same name, producing the duplicated title by construction.
- `LeagueChatTab.tsx` uses the shared `ChatView` without passing its supported `emptyState` prop. Direct-message threads do pass an empty state, which explains why only league chat is blank.
- Score strings are formatted independently. `GameRow.tsx` uses `score1 - score2`, `LeagueMatchesTab.tsx` renders separate values around an en dash, and other surfaces use compact hyphens or en dashes. There is no shared display formatter used by these components.

### Agent deliverables

- Choose one intentional league-detail hierarchy without redundant titles.
- Add a useful empty-chat state that explains the surface without blocking the composer.
- Introduce or reuse one score-formatting helper across mobile surfaces.
- Add snapshot or component tests for the revised states.

### Acceptance criteria

- League detail has one clear primary title treatment.
- Empty chat explains that there are no messages yet and keeps the composer usable.
- Scores use one separator and spacing convention throughout the mobile app.

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
| A — Friendship consistency | Unassigned | Not started | — | — |
| B — Active season invariant | Unassigned | Not started | — | — |
| C — Home/Profile freshness | Unassigned | Not started | — | — |
| D — Messaging behavior | Unassigned | Not started | — | — |
| E — UI cleanup | Unassigned | Not started | — | — |
