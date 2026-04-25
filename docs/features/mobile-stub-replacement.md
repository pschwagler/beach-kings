# Mobile Stub → Real API Replacement Plan

Branch: `feat/ps/mobile-app-creation`
Created: 2026-04-23
Status: In progress

This doc tracks the work to replace mock data and stubbed API calls in the Expo mobile app (`apps/mobile/`) with real backend calls. Work is broken into discrete agent-sized tasks. Each task lists the screens/files it touches, the endpoint surface it covers, and a mandatory **Reuse check** the implementing agent must perform before writing new code.

## Scope

**In scope:**
- Games, Leagues, Sessions, Courts, Messages, Player Profile, Notifications, Settings
- Promoting shared types out of `apps/mobile/src/lib/mockApi.ts` into `@beach-kings/shared`
- Wiring existing api-client methods where the mobile app is calling a mock variant

**Out of scope (remain stubbed for now):**
- Tournaments list & detail (`apps/mobile/src/components/screens/Tournaments/`)
- KOB / King of the Beach (`apps/mobile/src/components/screens/Kob/`)
- Any `/api/tournaments/*` backend endpoint work

Leave the tournament/KOB mock data in place — do not delete or touch `MOCK_TOURNAMENT`, `MOCK_TOURNAMENTS`, or their associated types in `mockApi.ts`.

---

## Ground Rules for Every Agent

Before writing any new code for a task, the agent MUST:

0. **Treat the wireframe as the spec.** Find the matching file in `mobile-audit/wireframes/` (e.g. `create-league.html`, `score-game.html`) and use the rendered fields/sections as the source of truth for what the screen should contain. The task descriptions in this doc are best-effort summaries and have been wrong about field lists before — when the spec and the wireframe disagree, the wireframe wins. Surface the discrepancy in your question batch.
1. **Re-read `packages/api-client/src/methods.ts` end-to-end.** Confirm whether a real method already exists for the feature. Several stubs are just mis-wired calls (e.g. `leaveLeagueMock` → `leaveLeague`, `sendLeagueMessage` → `createLeagueMessage`). Do not add a new api-client method if one already exists — wire the existing one.
2. **Re-read the backend route list.** Check `docs/API_ROUTES.md` and grep the backend source (routes/controllers/handlers) for the relevant resource. If a route already returns the data you need — even if the shape is slightly different — prefer enriching or adapting the existing route to adding a new one.
3. **Re-read `packages/shared/src/types/index.ts`.** If a type already exists for the resource, extend it rather than duplicating. Only introduce a new type if nothing usable is there.
4. **Check web client usage.** If `apps/web/` already consumes the same endpoint, mirror its calling pattern and type usage. Avoid divergent shapes between web and mobile for the same resource.
5. **Immutability + file-size rules from `CLAUDE.md`.** No in-place mutation, new objects only; keep files under ~400 lines; no emojis in code or docs.
6. **TDD.** Write unit tests for new api-client methods and hook-level tests for the mobile hook wiring before the implementation. Target 80%+ coverage on touched files.

At the end of each task: update the checkbox here, note the PR, and move any types promoted to shared into the **Type debt** section with a strikethrough.

---

## Phase 0 — Quick wins (no backend work)

These are pure mobile-side rewires. Existing api-client methods already cover them.

- [x] **P0.1 — Leave League**
  - File: `apps/mobile/src/components/screens/Leagues/useLeagueInfoTab.ts`
  - Change: `api.leaveLeagueMock(leagueId)` → `api.leaveLeague(leagueId)`
  - Reuse check: `leaveLeague` already exists in `packages/api-client/src/methods.ts` (`POST /api/leagues/:id/leave`).

- [x] **P0.2 — League Chat (send + fetch)**
  - File: `apps/mobile/src/components/screens/Leagues/useLeagueChatTab.ts`
  - Change: `sendLeagueMessage` → `createLeagueMessage`; `getLeagueChat` → `getLeagueMessages`. Adapt UI to `getLeagueMessages` return shape (or add a thin mapper in the hook to the mobile `LeagueChatMessage` shape).
  - Reuse check: Both real methods exist. Confirm web client's usage pattern in `apps/web/` before deciding on mapper location.

- [x] **P0.3 — League Seasons list**
  - Files: `apps/mobile/src/components/screens/Leagues/useLeagueDashboardTab.ts`, `useLeagueStatsTab.ts`
  - Change: `getLeagueSeasonsList(leagueId)` → `getLeagueSeasons(leagueId)`
  - Reuse check: verify return shape matches `LeagueSeason` expected by the UI; adapt in the hook if needed.

- [x] **P0.4 — Feedback submit**
  - File: `apps/mobile/src/components/screens/Settings/SettingsScreen.tsx`
  - Change: replace `Alert.alert('Feedback form coming soon.')` with a feedback modal that calls `submitFeedback(text)`.
  - Reuse check: `submitFeedback` already exists in api-client.

- [x] **P0.5 — Messages current player ID**
  - File: `apps/mobile/src/components/screens/Messages/useMessagesScreen.ts`
  - Change: remove `currentPlayerId = 0`; derive from `getCurrentUserPlayer()` (already available in auth state).
  - Reuse check: find where other mobile screens read the current player (e.g. profile screens) and mirror that pattern.

---

## Phase 1 — P1 blockers (forms currently throw)

These features throw on submit. Each task = one agent unit of work. Backend work may be required — coordinate with backend owner before implementing the mobile side.

### Games

- [ ] **P1.1 — Submit Scored Game**
  - Mobile: `apps/mobile/src/components/screens/Games/useScoreGameScreen.ts` (replace `submitScoredGame` stub + remove inline `MOCK_ROSTER`)
  - Endpoint (new): `POST /api/sessions/:id/games` with `{team_a, team_b, score_a, score_b, ...}`
  - Endpoint (new): `GET /api/sessions/:id/players` (roster picker)
  - API client (new): `submitScoredGame(sessionId, payload)`, `getSessionRoster(sessionId)`
  - Reuse check:
    - Search backend for any existing `games`, `matches`, or session-scoped game creation route. Project recently renamed `match → game` (commit `003b19a`) — an old match route may exist and need repurposing.
    - Check `packages/shared` for existing `Game` / `GameCreatePayload` types.
    - Check `apps/web/` for any existing score-submission flow to mirror.

- [ ] **P1.2 — My Games list with filters**
  - Mobile: `apps/mobile/src/components/screens/Games/useMyGamesScreen.ts`
  - Endpoint (new or extend): `GET /api/users/me/games?league_id=&result=`
  - API client (new): `getMyGames(params)`
  - Reuse check:
    - Check if `GET /api/users/me/stats` or a similar `/me/*` endpoint already aggregates game history — may be extendable.
    - Check `apps/web/` for existing game-history fetches.
    - Promote `GameHistoryEntry` from `mockApi.ts` into `@beach-kings/shared` (see Type debt).

### Leagues

- [ ] **P1.3 — Request to Join League**
  - Mobile: `apps/mobile/src/components/screens/Leagues/useFindLeaguesScreen.ts`
  - Endpoint (new): `POST /api/leagues/:id/join-request`
  - API client (new): `requestToJoinLeague(leagueId)`
  - Reuse check: backend may already have a `league_join_requests` model/table (the mock info tab assumes one exists with approve/deny). Grep the backend for `join_request` before designing new tables.

- [ ] **P1.4 — Approve / Deny Join Requests**
  - Mobile: `apps/mobile/src/components/screens/Leagues/useLeagueInfoTab.ts`
  - Endpoints (new): `POST /api/leagues/:id/join-requests/:playerId/approve`, `.../deny`
  - API client (new): `approveJoinRequest`, `denyJoinRequest`
  - Reuse check: pair with P1.3 — same backend resource; implement together in one backend PR.

- [ ] **P1.5 — Send League Invites**
  - Mobile: `apps/mobile/src/components/screens/Leagues/useLeagueInviteScreen.ts`
  - Endpoint (new): `POST /api/leagues/:id/invites`
  - API client (new): `sendLeagueInvites(leagueId, playerIds)`
  - Reuse check: commit `35f5c89` added invite deep links — there is probably already an `invites` table/route for deep-link invites. Extend rather than create a parallel system.

- [x] **P1.6 — Create League (wire to real API + form gaps)**
  - **Source of truth:** `mobile-audit/wireframes/create-league.html`. Original spec hallucinated `max_players`, `day_of_week`, `start_time`, free-text `court_name` — none of those are in the wireframe.
  - Wireframe fields: name, description, access type (Open/Invite Only), gender, level, location (dropdown), home court (FK to courts at the selected location).
  - Mobile: `apps/mobile/src/components/screens/Leagues/useCreateLeagueScreen.ts` + `CreateLeagueScreen.tsx`
    - Replace `mockApi.createLeagueMock` with real `api.createLeague`.
    - Add a Location picker (currently missing).
    - Replace the free-text `home_court_name` input with a real Court selector that filters by the selected location and sends `initial_court_id` (matches web's pattern).
    - Map `access_type: 'open' | 'invite_only'` → `is_open: boolean` in the hook before submit.
  - Endpoint: existing `POST /api/leagues`. **No schema changes, no new columns, no migration.** Existing fields already cover: `name`, `description`, `gender`, `level`, `is_open`, `location_id`, plus the post-create `POST /api/leagues/:id/home-courts` for the court FK.
  - API client: existing `createLeague(data: Partial<League>)` already exists — wire it; widen the param type only if necessary to include `location_id` and the home-court attachment.
  - Reuse check: web's `CreateLeagueModal` already does this exact flow. Mirror it.

- [ ] **P1.7 — Signup / Drop from League Event**
  - Mobile: `apps/mobile/src/components/screens/Leagues/useLeagueSignupsTab.ts`
  - Endpoints (new): `POST /api/leagues/:id/signups`, `DELETE /api/leagues/:id/signups/:eventId`
  - API client (new): `signUpForEvent(eventId)`, `dropFromEvent(eventId)`
  - Reuse check: sessions already have a concept of participation — confirm whether league events are distinct entities or reuse the session roster table.

### Sessions

- [x] **P1.8 — Create Session (expanded form)**
  - Mobile: `apps/mobile/src/components/screens/Sessions/useSessionCreateScreen.ts`
  - Endpoint (extend): `POST /api/sessions` — accept `start_time`, `court_name`, `session_type`, `max_players`, `notes`
  - API client (extend): widen `createSession` param type (currently `createSession(date?)`)
  - Reuse check: inspect existing `Session` type in `packages/shared` — add fields there rather than introducing a parallel `SessionCreateInput`.

- [ ] **P1.9 — Remove Player from Session Roster**
  - Mobile: `apps/mobile/src/components/screens/Sessions/useSessionRosterScreen.ts`
  - Endpoint (new): `DELETE /api/sessions/:id/players/:playerId`
  - API client (new): `removeSessionPlayer`
  - Reuse check: pair with P2.5 (add player) — same resource, implement together.

### Auth / Settings

- [x] **P1.10 — Change Password** — PR: `feat/ps/p1-change-password`
  - Mobile: `apps/mobile/src/components/screens/Settings/ChangePasswordScreen.tsx` (remove fake `setTimeout`)
  - Endpoint (new or existing): `POST /api/auth/change-password`
  - API client (new): `changePassword(currentPassword, newPassword)`
  - Reuse check: the password-reset flow (commit `35f5c89` expanded auth) likely has a reset-password endpoint. Change-password for an authed user is a distinct route — confirm before implementing.

---

## Phase 2 — P2 high priority (feature areas show fake data)

Each of these screens currently renders mock data; the feature *works* but values are lies. Most need a new aggregated backend endpoint.

### League aggregated views

- [ ] **P2.1 — League Detail (overview tab)**
  - File: `useLeagueDetailScreen.ts`
  - Endpoint: `GET /api/leagues/:id/detail` OR enrich `GET /api/leagues/:id`
  - Reuse check: strongly prefer enriching the existing `getLeague(id)` response over adding a `/detail` suffix route. Check web client's league page to see what fields it already consumes.

- [ ] **P2.2 — League Standings tab**
  - File: `useLeagueDashboardTab.ts`
  - Endpoint: `GET /api/leagues/:id/standings?season_id=`
  - Reuse check: standings computation may already exist in backend for the web standings page — grep for `standings` and see if the existing query is reusable.

- [ ] **P2.3 — League Info tab (rules, join requests, invites, payment)**
  - File: `useLeagueInfoTab.ts`
  - Endpoint: `GET /api/leagues/:id/info` (aggregated)
  - Reuse check: this is a composition of several sub-resources (join requests P1.4, invites P1.5, commissioner info, rules). Consider whether to build a single aggregated endpoint or have the hook fan out multiple parallel fetches. Prefer parallel fetches if the sub-resources are useful independently.

- [ ] **P2.4 — League Stats tab (per-player)**
  - File: `useLeagueStatsTab.ts`
  - Endpoint: `GET /api/leagues/:leagueId/players/:playerId/stats?season_id=`
  - Reuse check: `/api/users/me/stats` already exists. Check whether it accepts `league_id` or can be extended to support arbitrary player IDs (respecting privacy settings).

- [ ] **P2.5 — League Events / Signups list**
  - File: `useLeagueSignupsTab.ts`
  - Endpoint: `GET /api/leagues/:id/events` (must include signup status for current user)
  - Reuse check: same reuse check as P1.7 — events may map onto existing sessions.

- [ ] **P2.6 — Find Leagues search** *(backend done; mobile wiring pending after P1.8 commits)*
  - File: `useFindLeaguesScreen.ts`
  - Endpoint: extended existing `POST /api/leagues/query` — added `q` (ILIKE on name/description) and `is_open` (boolean) params; 4 new route tests (45 total pass). No migration, no model changes.
  - Mobile wiring remaining: replace `mockApi.findLeagues` with real `api.queryLeagues({q, is_open, gender, level})`; add `queryLeagues` method to api-client. Blocked on `methods.ts` being dirty from P1.8.
  - Reuse check done: extended `POST /api/leagues/query` per plan guidance; no `/find` route needed.

- [ ] **P2.7 — Invitable Players + Pending Invites**
  - Files: `useLeagueInviteScreen.ts`, `usePendingInvitesScreen.ts`
  - Endpoints: `GET /api/leagues/:id/invitable-players?q=`, `GET /api/leagues/:id/invites/sent`
  - Reuse check: player search likely exists in a "find players" feature elsewhere — reuse that search with a league-context filter rather than building a parallel endpoint.

### Session aggregated views

- [ ] **P2.8 — Session Detail + Roster**
  - Files: `useSessionDetailScreen.ts`, `useSessionRosterScreen.ts`
  - Endpoint: `GET /api/sessions/:id` (full detail including roster and games played)
  - Reuse check: a session-detail endpoint likely exists (web client has session management). Confirm shape before adding `getSessionById`.

- [ ] **P2.9 — Add Player to Session**
  - File: `useSessionRosterScreen.ts` (also wire the currently empty `onAddPlayer` callback)
  - Endpoint: `POST /api/sessions/:id/players` with `{player_id}`
  - Reuse check: pair with P1.9.

---

## Phase 3 — P3 medium (partial data / hardcoded values)

- [ ] **P3.1 — Court Photos**
  - File: `apps/mobile/src/components/screens/Venues/useCourtPhotosScreen.ts`
  - Endpoint (new): `GET /api/courts/:id/photos`
  - Reuse check: if court reviews already carry photo uploads, the photos may live on the court record — check the existing court detail response before designing a separate photos endpoint.

- [ ] **P3.2 — Player Trophies**
  - File: `usePlayerProfileScreen.ts` (remove `MOCK_TROPHIES`)
  - Endpoint (new): `GET /api/players/:id/trophies`
  - Reuse check: trophies may be derivable from game history + league season results — consider whether the backend should compute this or whether a materialized `trophies` table exists.

- [ ] **P3.3 — Player Leagues list**
  - File: `usePlayerProfileScreen.ts` (remove `MOCK_LEAGUES`)
  - Endpoint: extend `getUserLeagues(userId)` to accept a player ID param (if it only serves `me` today) OR add `GET /api/players/:id/leagues`
  - Reuse check: `getUserLeagues` exists — prefer parameterizing it.

- [ ] **P3.4 — Push Notification Preferences**
  - File: `apps/mobile/src/components/screens/Settings/useNotificationsScreen.ts`
  - Endpoints (new): `GET /api/users/me/push-prefs`, `PATCH /api/users/me/push-prefs`
  - Reuse check: if the user profile already has notification-preference fields, patch via `updateUserProfile` instead of a new sub-resource.

- [ ] **P3.5 — My Stats filters (league_id, days)**
  - File: `useMyStatsScreen.ts`
  - Endpoint: extend existing `GET /api/users/me/stats` with `?league_id=&days=`
  - Reuse check: this is a parameter extension on an existing method — do not add a new method.

---

## Phase 4 — P4 low (polish / stubs)

- [ ] **P4.1 — Delete Account** — `DELETE /api/users/me`. Reuse check: GDPR/deletion flow may already exist in the web settings.
- [ ] **P4.2 — Connected Accounts (Google/Apple status)** — extend `GET /api/users/me` to include connection status (commit `35f5c89` wired Apple sign-in, so connection state is already tracked somewhere).
- [ ] **P4.3 — Privacy settings (Profile Visibility, Game History)** — extend `PATCH /api/users/me`. Add fields to existing `User` type, not a new resource.
- [ ] **P4.4 — Rate App** — deep link to App Store, no API work.
- [ ] **P4.5 — Contact Support** — `mailto:` link or form submission via existing `submitFeedback`.

---

## Type debt

Types currently defined only in `apps/mobile/src/lib/mockApi.ts` that must be promoted to `packages/shared/src/types/index.ts` as their phases complete. Strike through when moved.

**Leagues:** `LeagueDetail`, `LeagueStanding`, `LeagueSeason`, `LeagueChatMessage`, `LeagueEvent`, `LeagueScheduleRow`, `LeagueMemberRow`, `LeagueJoinRequest`, `LeagueInfoDetail`, `LeagueInviteItem`, `InvitablePlayer`, `FindLeagueResult`, `LeaguePlayerStats`

**Sessions:** `SessionPlayer`, `SessionGame`, `SessionDetail`, `SessionSummary`

**Games:** `GameHistoryEntry`

**Settings:** `PushNotificationPrefs`

**Tournaments (out of scope — leave in mockApi.ts):** `Tournament`, `TournamentTeam`, `TournamentGame`, `TournamentStanding`, `KobScheduleRow`

Before promoting a type, check if a similar one already exists in `@beach-kings/shared` and extend rather than duplicate.

---

## Backend endpoint master list

Grouped for backend sprint planning. Tournament/KOB endpoints intentionally omitted.

**Must-build (Phase 1 blockers):**
- `POST /api/sessions/:id/games`
- `GET /api/sessions/:id/players`
- `GET /api/users/me/games?league_id=&result=`
- `POST /api/leagues/:id/join-request`
- `POST /api/leagues/:id/join-requests/:playerId/{approve,deny}`
- `POST /api/leagues/:id/invites`
- `DELETE /api/sessions/:id/players/:playerId`
- Extend `POST /api/sessions` with full session fields
- Extend `POST /api/leagues` with full league fields
- `POST /api/auth/change-password`

**High (Phase 2):**
- `GET /api/sessions/:id` (detail)
- `POST /api/sessions/:id/players`
- `GET /api/leagues/:id/standings`
- `GET /api/leagues/:id/events`
- `GET /api/leagues/:id/info`
- `GET /api/leagues/:id/invitable-players`
- `GET /api/leagues/:id/invites/sent`
- `GET /api/leagues/find` (or extend list endpoint)
- `GET /api/leagues/:id/detail` (or enrich `GET /api/leagues/:id`)
- Extend `GET /api/users/me/stats` with filter params

**Medium (Phase 3):**
- `GET /api/leagues/:leagueId/players/:playerId/stats`
- `GET /api/users/me/push-prefs` + `PATCH`
- `GET /api/players/:id/trophies`
- `GET /api/players/:id/leagues` (or extend existing)
- `GET /api/courts/:id/photos`

**Low (Phase 4):**
- `DELETE /api/users/me`
- Extend `GET /api/users/me` with connected-account status
- Extend `PATCH /api/users/me` with privacy settings

---

## Status log

_Update this section as tasks complete._

- 2026-04-23: Plan created. No tasks started.
- 2026-04-23: Phase 0 (P0.1–P0.5) complete. All 5 quick-win rewires landed:
  - `leaveLeagueMock` → `api.leaveLeague`
  - `getLeagueChat` / `sendLeagueMessage` → `api.getLeagueMessages` / `api.createLeagueMessage`. Mobile `LeagueChatMessage` realigned to mirror backend field names (`message`, `created_at`, `player_name`, `player_id`) instead of the old `text`/`sent_at`/`display_name`. `initials` is still client-derived (pure presentation).
  - `getLeagueSeasonsList` → `api.getLeagueSeasons` with null-safe `Season` → picker-entry mapper in both dashboard + stats hooks
  - SettingsScreen feedback Alert replaced with real `FeedbackModal` → `api.submitFeedback`
  - `useMessagesScreen.currentPlayerId` now derived from `api.getCurrentUserPlayer()` (was hardcoded `0`)
  - Full mobile test suite: 67 suites / 1261 tests pass. `tsc --noEmit` clean. Added 5 new tests for the feedback modal flow.

- 2026-04-23: **Bonus backend change** (originally listed as Phase-0-no-backend but promoted to make the codebase right): `GET /api/leagues/:id/messages` and `POST /api/leagues/:id/messages` now return a server-computed `is_mine` flag (`row.user_id == current_user_id`). Mobile dropped the extra `getCurrentUserPlayer` fetch it was using to derive this locally; backend tests updated. Web can adopt this field later to replace its own inline comparison. **Pattern note**: any future chat-shaped endpoint (DMs, session chat, etc.) should include a server-computed `is_mine` from day one — auth-relative derivations belong on the server, not in every client.

- 2026-04-25: **P1.6 Create League** complete. `mockApi.createLeagueMock` deleted; hook now calls `api.createLeague` with `access_type → is_open` mapping (`'open'` → `true`, `'invite_only'` → `false`). Added Location picker (fetches `api.getLocations()` on mount) and Court selector (fetches `api.getCourts({ location_id })` when location changes; resets on location change). On submit: `api.createLeague`, then optional `api.addLeagueHomeCourt(newId, courtId)` (non-fatal if fails). Added `addLeagueHomeCourt` to api-client. 20 new tests; full mobile suite: 1278 pass. `tsc --noEmit` clean.

- 2026-04-25: **P1.10 Change Password** complete. Full delivery:
  - **Backend** (branch `feat/ps/p1-change-password`): `POST /api/auth/change-password` — bcrypt verify, 8-char min, 400 for OAuth accounts, revokes all refresh tokens on success, sets `password_changed_at` (nullable TIMESTAMPTZ). Alembic migration `040_add_password_changed_at` with `_column_exists` idempotency guard. 20 tests (happy path, bad current password, too short, OAuth block, unauth).
  - **API client**: `changePassword(currentPassword, newPassword)` in `packages/api-client/src/methods.ts`.
  - **Shared types**: `ChangePasswordRequest`, `ChangePasswordResponse`, `has_password?: boolean` on `AuthResponse` in `packages/shared/src/types/auth.ts`.
  - **Mobile**: `ChangePasswordScreen.tsx` replaces `setTimeout` stub with real `api.changePassword` call; `SettingsScreen.tsx` hides "Password" row when `user.has_password === false` (OAuth accounts); `AuthContext.tsx` threads `has_password` through session restore, login, OAuth, and refresh paths.
  - **Tests**: `change-password.test.tsx` — success banner + navigate back after 800ms, 401/400/generic error handling; `settings.test.tsx` — OAuth user hides password row. Full mobile suite: 1273 pass, 1 pre-existing fail (ThemeContext unrelated). `tsc --noEmit` clean.
  - **Docs**: `API_ROUTES.md` and `DATABASE_SCHEMA.md` updated in the worktree.

---

## Phase 1 execution plan (agreed 2026-04-25)

**Model:** sequential, one agent at a time, all branched off the latest `main`. No worktrees, no parallel dispatch — the shared-file blast radius (`packages/api-client/src/methods.ts`, `packages/shared/src/types/index.ts`, `apps/mobile/src/lib/mockApi.ts`, `apps/backend/api/routes/{leagues,sessions,auth}.py`) makes parallel work too merge-conflict-prone.

### Mandatory question-first protocol for every Phase 1 agent

Each agent's prompt must open with this directive verbatim:

> **STOP and ask before writing any code if any of the following are unclear.** Compile your questions into a single batched list and return it to the orchestrator — do not proceed with assumptions on functional behavior. Resume only after the orchestrator relays answers from the user.
>
> Specifically pause to ask about:
> 1. **Domain rules** — eligibility, validation, edge cases, who can do what (e.g. "can a non-commissioner approve join requests?", "what happens if a session is full?", "is partial-team scoring allowed?")
> 2. **UX behavior on success/failure** — toast vs modal vs inline, navigation after submit, optimistic vs pessimistic updates
> 3. **Data shape ambiguity** — when the mock shape differs from existing backend shapes, or when a field's semantics aren't obvious from the code
> 4. **Schema decisions** — when adding tables/columns, surface the proposed schema for approval before writing the migration
> 5. **Reuse-vs-new judgment calls** — when an existing endpoint *almost* fits but would need extending; do not silently fork a parallel resource
>
> Acceptable to proceed without asking: pure mechanical work (deleting an obsolete mock entry, wiring an already-agreed type, writing a test for an already-agreed contract).

### Branching policy (revised 2026-04-25)

**All Phase 1 work commits directly to `feat/ps/mobile-app-creation`.** Do NOT use `git worktree`, do NOT create per-task feature branches, do NOT open per-task PRs. The full mobile feature branch is the single integration point — it carries every P1 task as a sequence of commits and merges to main as one PR when Phase 1 is done.

Rationale: a previous attempt at per-task worktree + PR ran into merge conflicts on shared files (`packages/api-client/src/methods.ts`, `packages/shared/src/types/index.ts`, mobile-only files that don't exist on main). Single-branch keeps the diff coherent.

### Agent delivery contract (per task)

After questions are answered, each agent owns the full lifecycle — no hand-offs:

1. **Plan & reuse check** — read `methods.ts`, `docs/API_ROUTES.md`, `packages/shared/src/types/index.ts`, equivalent web flow. Document findings in the commit message body.
2. **Backend (TDD)** — pytest first (happy path + auth + 4xx edge cases), Alembic migration if needed (never destructive), Pydantic schema, SQLAlchemy model, route. Update `docs/API_ROUTES.md` and `docs/DATABASE_SCHEMA.md` if schema changes.
3. **API client** — unit test with mocked fetch, then implementation in `methods.ts`.
4. **Shared types** — promote from `mockApi.ts` to `@beach-kings/shared`; strike through the type in the Type debt section above.
5. **Mobile (TDD)** — hook test first, hook implementation, delete the obsolete entry from `mockApi.ts`.
6. **Validation gate (must pass before commit):**
   - `cd apps/backend && pytest <touched paths>`
   - `cd apps/mobile && npm test` (full suite)
   - `tsc --noEmit` clean across `apps/mobile`, `packages/api-client`, `packages/shared`
   - Manual sanity in Expo (or document why blocked)
   - Update the checkbox + commit hash in this doc's status log
7. **Commit & push** — conventional commit on `feat/ps/mobile-app-creation`, push to origin. **No new branches, no PRs.**

### Sequenced task order

Picked to land foundational types early so downstream tasks can reuse them, and to keep each agent's blast radius minimal:

1. **P1.10** Change Password — smallest, isolated to `auth.py` + one screen; good warm-up. ✓ DONE
2. **P1.6** Expand createLeague — payload extension, no new routes; establishes the expanded `League` shape. ✓ DONE
3. **P1.8** Expand createSession — payload extension, mirrors P1.6 pattern. ✓ DONE
4. **P1.1** Submit Scored Game — net-new `Game` resource, foundational for P1.2. ← RESUME POINT
5. **P1.2** My Games list — depends on P1.1's `Game` type.
6. **P1.3 + P1.4** Join Requests (bundled, one agent) — full request/approve/deny lifecycle on a single resource.
7. **P1.5** League Invites — must coordinate with existing deep-link invite system from commit `35f5c89` (likely a question batch).
8. **P1.9 + P2.9** Session player remove + add (bundled, one agent — P2.9 pulled forward) — pairs naturally on `sessions.py`.
9. **P1.7** Event Signups — most schema-heavy; last so prior decisions inform it.

### Orchestrator loop

For each task in sequence:
1. Verify `feat/ps/mobile-app-creation` is clean (or that any unstaged work has been committed).
2. Dispatch the agent with the task spec + question-first directive.
3. If the agent returns questions → relay to user, wait for answers, resume the agent (or dispatch a fresh agent with full context if SendMessage isn't available) to continue.
4. Agent finishes → spot-check the validation gate, confirm commit pushed.
5. Update the status log entry below.
6. Move to next task.

### Resume point

**Next task: P1.6 Expand createLeague.**
