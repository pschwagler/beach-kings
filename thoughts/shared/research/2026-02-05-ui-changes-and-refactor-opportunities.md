---
date: "2026-02-05T16:59:47Z"
researcher: Cursor
git_commit: 99d7acbb72a474f289a8182a698f2ad6e1e26794
branch: develop
repository: beach-kings
topic: "UI changes vs main and similar refactor/improvement opportunities"
tags: [research, codebase, UI, refactor, SessionPlayersModal, session, league, modals]
status: complete
last_updated: "2026-02-05"
last_updated_by: Cursor
reviewed_by: Senior engineer (code quality & UI performance)
---

# Research: UI changes vs main and similar refactor/improvement opportunities

**Date**: 2026-02-05T16:59:47Z  
**Researcher**: Cursor  
**Git Commit**: 99d7acbb72a474f289a8182a698f2ad6e1e26794  
**Branch**: develop  
**Repository**: beach-kings  

## Research Question

Look at all UI changes different from main and summarize similar other opportunities to refactor and improve in a research document.

---

## Senior engineer review: fitness for improving UI from main

**Verdict: Good enough to drive UI improvements from main**, with the additions below.

This document accurately captures develop-vs-main UI delta, uncommitted session refactors, and comparable opportunities elsewhere. To use it effectively for **code quality** and **UI performance**:

- **Code quality:** The opportunities map well to clean-code rules (`.cursor/rules/clean-code.mdc`): single responsibility (split large modals), DRY (constants, batch API, shared toolbar), encapsulation (page-level hooks). Use this doc as the backlog; each item should leave code cleaner and more testable.
- **UI performance:** The original research does not explicitly cover performance. A new **§2.7 UI performance** section below adds: lazy-loading heavy modals, memoization and list rendering for large lists, and bundle/main-thread impact of 700+ line components. Address these when touching the same areas.
- **Prioritization:** A **Prioritized action list** section orders work by impact and dependency so the team can merge develop to main with confidence and then iterate.
- **Definition of done:** For each refactor, consider: unit tests for new hooks/utils, E2E still green, no new accessibility regressions, and (where applicable) performance baseline (e.g. modal open time, list scroll) documented or preserved.

---

## Summary

**UI changes vs main (develop branch):** The diff from `main` to `develop` introduces non-league (pickup) sessions: a session-by-code page, Session Players modal, OpenSessionsList, MyGamesTab updates, session-related API usage, and shared session/match UI (ActiveSessionPanel, view toggles). Session page and SessionPlayersModal are large, single-file components with inline data loading and inline constants. **Local (uncommitted) refactors** further change the session area: Session Players modal is split into smaller components and a hook, centralized filter/division utils are added, batch invite is implemented (backend + frontend), session page uses a `usePickupSession` hook, and CreateLeagueModal/leagueUtils use shared constants.

**Similar opportunities:** Elsewhere in the app there are (1) other large modals and components that could be split and/or backed by hooks, (2) a league “add players” flow that loops `addLeagueMember` and could use a batch API and submit-on-close pattern, (3) remaining constant duplication (e.g. `playerFormConstants` vs `playerFilterOptions` for gender/level), (4) league dashboard/match flow already using hooks (good pattern to reuse), and (5) other pages that could benefit from a “page data” hook like `usePickupSession`.

---

## Detailed Findings

### 1. UI changes different from main (develop)

**Source:** `git diff main --stat -- apps/web/` and current working tree.

**New or heavily changed UI on develop (vs main):**

| Area | Files / change |
|------|----------------|
| **Session by code** | `apps/web/app/session/[code]/page.jsx` (new, 658 lines in diff). Renders session header, share/delete/leave, view toggle (Cards/Table), ActiveSessionPanel, SessionPlayersModal, “Create new session with same players”. |
| **Session Players modal** | `SessionPlayersModal.jsx` (+204 in diff). Single large modal: “In this session” list, “Add players” tab with search, Location/League/Gender/Level filters, player list, add/remove. |
| **Session components** | `ActiveSessionPanel.jsx`, `SessionActions.jsx`, `SessionGroupHeader.jsx`, `SessionHeader.jsx` — shared with league matches. |
| **Home / My Games** | `MyGamesTab.jsx`, `OpenSessionsList.jsx` — list pickup sessions and entry to session by code. |
| **API** | `api.js`: session-by-code, participants, invite, create session, lock, delete, update, etc. |
| **E2E** | `SessionPage.js`, `pickup-session.spec.js` — session and players modal flows. |

**Uncommitted (local) refactors in session area:**

- **Centralized utils:** `apps/web/src/utils/playerFilterOptions.js` (GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS, LEVEL_OPTIONS, GENDER_OPTIONS_LEAGUE), `divisionUtils.js` (formatDivisionLabel).
- **Batch invite:** Backend `POST /api/sessions/{session_id}/invite_batch`; frontend `inviteToSessionBatch`; modal collects pending adds and submits on Done.
- **Modal split:** `SessionPlayersModal.jsx` (shell + tabs), `SessionPlayersInSessionPanel.jsx`, `SessionPlayersAddPanel.jsx`, `PlayerFilterPopover.jsx`, `session/hooks/useSessionPlayersModal.js`.
- **Session page hook:** `usePickupSession(code)` in `src/hooks/usePickupSession.js` — loads session, matches, participants, userLeagues, refresh; derived isCreator, hasLessThanFourPlayers, membersForModal, transformedMatches.
- **Constants consolidation:** CreateLeagueModal and leagueUtils import LEVEL_OPTIONS / GENDER_OPTIONS_LEAGUE from `playerFilterOptions.js`.

These refactors align the session UI with patterns already used in the league flow: smaller components, shared constants, a data hook for the page, and a single batch API for multi-invite.

---

### 2. Similar refactor and improvement opportunities

#### 2.1 Large modals / components (split + hooks)

**Current state:**

- **AddMatchModal.jsx** (~717 lines): Form, league/season selection, player dropdowns, validation, submission. Already uses several hooks (`useLeagueSeasonSelection`, `useMatchFormUI`, `useFormSubmission`, `usePlayerMappings`, `useMatchFormHandlers`, `useMatchValidation`, `useMatchPayload`). Remaining opportunity: extract presentational sections (e.g. league/season block, team blocks) into subcomponents to shorten the main file.
- **PhotoMatchReviewModal.jsx** (~958 lines): Photo job stream, partial results, edit/confirm flow, conversation UI. Single file with many responsibilities. **Opportunity:** Split into smaller components (e.g. result list, conversation panel, header/actions) and/or a `usePhotoMatchReview`-style hook for job state, streaming, and submit logic.
- **UploadPhotoModal.jsx** (~519 lines): Upload and photo-match start. **Opportunity:** Extract upload area vs. preview/actions into subcomponents; optional small hook for upload state and API.
- **MatchesTable.jsx** (~741 lines): Renders session groups, match cards/rows, add/edit. **Opportunity:** Already complex; consider extracting session group row and match row (or card) into dedicated components if not already; keep table logic in one place but delegate rendering.
- **LeagueMatchesTab.jsx** (~499 lines): Uses hooks (useActiveSession, useDataRefresh, useMatchOperations, useSessionEditing, useSessionSeasonUpdate, usePersistedViewMode). Structure is already hook-heavy; **opportunity:** extract any large JSX blocks (e.g. filters + view toggle + “Manage players”) into a presentational component for readability.
- **Session page** (`app/session/[code]/page.jsx`, 658 lines): With local refactor it uses `usePickupSession`; remaining content is header, view toggle, ActiveSessionPanel, modals. **Opportunity:** Optional “SessionContent” wrapper that takes hook output and renders header + toggle + panel (reuse if another session view is added later).

**Pattern to reuse:** Session Players refactor: one container component, multiple presentational panels, one hook for state and side effects. Same pattern fits other large modals and tabs.

---

#### 2.2 Batch API and “submit on close” (add players to league)

**Current state:**

- **AddPlayersModal.jsx** (league): User selects multiple players (and roles), then clicks “Add Players”. Submit handler runs a **loop** of `addLeagueMember(leagueId, selectedPlayer.player_id, selectedPlayer.role)` per player ([AddPlayersModal.jsx:123–125](apps/web/src/components/league/AddPlayersModal.jsx)).
- Session Players modal (after refactor): Uses `inviteToSessionBatch` on Done; no per-click API.

**Opportunity:**

- Add a backend **batch add league members** endpoint (e.g. `POST /api/leagues/{league_id}/members_batch` with `{ members: [{ player_id, role }] }`), and a frontend `addLeagueMembersBatch(leagueId, members)`.
- Change AddPlayersModal to collect selections in state and call the batch API once on “Add Players” (submit), with clear success/partial-failure handling.
- Same pattern as session batch invite: fewer round trips, one place to show “X added; Y failed”, and consistent with the session refactor.

---

#### 2.3 Constants and form options (single source of truth)

**Current state:**

- **playerFilterOptions.js** (refactor): GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS (with “All”), LEVEL_OPTIONS (form dropdown with “Select skill level”), GENDER_OPTIONS_LEAGUE. Used by Session Players panels, CreateLeagueModal, leagueUtils/LeagueInfoSection.
- **playerFormConstants.js**: GENDER_OPTIONS (Male/Female), SKILL_LEVEL_OPTIONS (beginner, intermediate, advanced, AA, Open). Used by **PlayerProfileFields.jsx** for profile edit.
- **CreateLeagueModal**: Uses GENDER_OPTIONS_LEAGUE + local “Mixed” (disabled). LEVEL_OPTIONS from playerFilterOptions.

**Opportunity:**

- Unify gender/level for **forms** in one place: either extend `playerFilterOptions.js` (or a shared `playerFormOptions.js`) with form-specific options used by both league/create and profile, or have profile import from the same module and map “Open”/“AA” vs “open”/backend as needed.
- Document backend value for level (e.g. “Open” for league vs “open” for filters) in that module so future UIs stay consistent.
- Reduces drift between profile form and league/session options and keeps labels and values in one documented location.

---

#### 2.4 Page-level data hooks (league vs session)

**Current state:**

- **Session page:** Uses `usePickupSession(code)` (refactor) for load, refresh, and derived state. Page only handles UI state and handlers that call API then `refresh()`.
- **League page:** `app/league/[id]/page.jsx` is thin; it wraps with `LeagueProvider` and renders `LeagueDashboard`. Data and session logic live in **LeagueContext** and in **LeagueMatchesTab** via hooks (useActiveSession, useDataRefresh, useMatchOperations, etc.). There is no single “useLeaguePage” hook; the pattern is context + tab-level hooks.

**Opportunity:**

- **League:** If desired, introduce a `useLeagueDashboard(leagueId)` (or per-tab hooks like `useLeagueMatches(leagueId, seasonId)`) that encapsulate “load league, seasons, members, active session, refresh” and return the same shape the dashboard/tabs need. That would mirror `usePickupSession` and make the league flow even more consistent with the session flow.
- **Other pages:** Any future “detail by ID/code” page (e.g. player, season) could follow the same pattern: one hook that loads and refreshes, page only composes UI and handlers.

---

#### 2.5 Reuse of shared UI building blocks

**Current state:**

- **ActiveSessionPanel:** Reused by session page and league matches (MatchesTable). View toggle (Cards/Table) and “Manage players” live in both session page and LeagueMatchesTab with similar structure.
- **PlayerFilterPopover** (refactor): Reusable Location/League/Gender/Level multiselect. Currently used only in SessionPlayersAddPanel.

**Opportunity:**

- **AddPlayersModal** (league): Could use a **search + filter + list** pattern similar to Session Add panel (e.g. reusing PlayerFilterPopover for Location/League/Gender/Level if “add players” gets filters). Today it only has search and a flat list; adding filters would be easier if it reused the same popover and option sets from `playerFilterOptions.js`.
- **View toggle + “Manage players”:** If more screens need “Cards/Table + Manage players”, extract a small `SessionViewToolbar` (or similar) used by both session page and LeagueMatchesTab to avoid duplicating that block.

---

#### 2.6 E2E and testability

**Current state:**

- Session Players modal and session page have E2E in `SessionPage.js` and `pickup-session.spec.js`; refactor kept class names and `data-testid`s (e.g. `session-players-drawer`, `session-players-add`, `.session-players-add-btn`).
- League flows are covered in `edit-sessions-matches.spec.js`, `create-games.spec.js`, etc.

**Opportunity:**

- When refactoring other large modals (e.g. AddPlayersModal, PhotoMatchReviewModal), preserve or add stable selectors (data-testid or dedicated classes) so E2E does not depend on implementation details. Session refactor is a good reference: same class names and testids after split.

---

#### 2.7 UI performance

**Current state:**

- **Modals:** AddMatchModal (717), PhotoMatchReviewModal (958), UploadPhotoModal (519), MatchesTable (741) are large single-file components. They are likely loaded with the main bundle; opening a modal does not currently imply code-splitting. The app already uses `useMemo`/`useCallback` in several places (e.g. AddPlayersModal, MatchesTable, LeagueContext); no consistent use of `React.memo` for list item components.
- **Lists:** AddPlayersModal loads up to 500 players and filters in memory; SessionPlayersAddPanel and league player lists render flat DOM. No virtualization was found for long lists; for 100–500 items this may be acceptable but is a risk if lists grow.
- **Session page:** Uses `usePickupSession`; derived state is computed in the hook. No obvious N+1 or redundant fetches; refresh is explicit after mutations.

**Opportunities:**

- **Lazy-load heavy modals:** Use `React.lazy()` + `Suspense` for PhotoMatchReviewModal, AddMatchModal, and UploadPhotoModal so their code (and dependencies) load only when the modal is opened. Reduces initial bundle and TTI.
- **Memoize list items:** For MatchesTable rows/cards and SessionPlayersAddPanel/AddPlayersModal player rows, wrap item components in `React.memo` and ensure stable `key`s and callback props (e.g. via `useCallback`) to avoid unnecessary re-renders when parent state changes.
- **Virtualization (if lists grow):** If player or match lists routinely exceed ~200 visible items, consider a virtualized list (e.g. `react-window` or `@tanstack/react-virtual`) for the scrollable area. Not required for current scale but document as a future option.
- **Bundle awareness:** When splitting large modals into subcomponents, keep heavy dependencies (e.g. photo/streaming libs) inside the lazy-loaded chunk so the main route stays fast.

---

## Prioritized action list (for improving UI from main)

Use this order to maximize impact and minimize rework:

| Priority | Action | Rationale |
|----------|--------|-----------|
| **P0** | Merge develop → main with current session refactors (batch invite, usePickupSession, modal split, playerFilterOptions, divisionUtils). | Uncommitted refactors align session UI with league patterns and reduce technical debt before release. |
| **P1** | Add batch league members API + AddPlayersModal submit-on-close. | Removes N round-trips and aligns with session batch invite; clear code quality and UX win. |
| **P2** | Unify form constants (playerFilterOptions vs playerFormConstants). | Single source of truth for gender/level; reduces drift and supports clean-code/DRY. |
| **P3** | Split PhotoMatchReviewModal (and optionally UploadPhotoModal) into smaller components + optional hook; add lazy loading for these modals. | Largest files; split improves maintainability; lazy load improves TTI and LCP. |
| **P4** | Extract presentational blocks from AddMatchModal; consider SessionViewToolbar for session page + LeagueMatchesTab. | Improves readability and reuse without changing behavior. |
| **P5** | Add React.memo for list item components in MatchesTable and player lists; consider virtualization if lists grow. | Performance hardening; low risk if keys and callbacks are stable. |

**Definition of done (per refactor):** Tests updated or added for new hooks/utils; existing E2E (e.g. `pickup-session.spec.js`, `edit-sessions-matches.spec.js`) still pass; no new a11y regressions; for performance-related changes, no regression in perceived modal open time or list scroll (optional: add a one-line note in the doc or PR).

---

## Code references

- `apps/web/app/session/[code]/page.jsx` — Session by code page; uses `usePickupSession` after refactor.
- `apps/web/src/components/session/SessionPlayersModal.jsx` — Session Players modal shell (refactor).
- `apps/web/src/components/session/SessionPlayersInSessionPanel.jsx` — In-session list panel.
- `apps/web/src/components/session/SessionPlayersAddPanel.jsx` — Add players panel (search, filters, list).
- `apps/web/src/components/session/PlayerFilterPopover.jsx` — Reusable filter popover.
- `apps/web/src/components/session/hooks/useSessionPlayersModal.js` — Modal state and batch invite on close.
- `apps/web/src/hooks/usePickupSession.js` — Session page data and refresh.
- `apps/web/src/utils/playerFilterOptions.js` — Central filter/form options.
- `apps/web/src/utils/divisionUtils.js` — formatDivisionLabel.
- `apps/web/src/components/league/AddPlayersModal.jsx` — League add players; loops `addLeagueMember`.
- `apps/web/src/components/league/CreateLeagueModal.jsx` — Uses LEVEL_OPTIONS, GENDER_OPTIONS_LEAGUE from playerFilterOptions.
- `apps/web/src/components/league/utils/leagueUtils.js` — Re-exports LEVEL_OPTIONS from playerFilterOptions.
- `apps/web/src/components/player/PlayerProfileFields.jsx` — Uses GENDER_OPTIONS, SKILL_LEVEL_OPTIONS from playerFormConstants.
- `apps/web/src/utils/playerFormConstants.js` — GENDER_OPTIONS, SKILL_LEVEL_OPTIONS for profile.
- `apps/web/src/components/match/AddMatchModal.jsx` — Large modal with many hooks.
- `apps/web/src/components/match/PhotoMatchReviewModal.jsx` — Very large modal; streaming and confirm flow.
- `apps/web/src/components/league/LeagueMatchesTab.jsx` — Uses useActiveSession, useDataRefresh, useMatchOperations, etc.
- `apps/backend/api/routes.py` — Contains `invite_to_session` and (after refactor) `invite_to_session_batch`.

---

## Architecture documentation

- **Session (pickup) flow:** Session by code → load session + matches + participants (via usePickupSession or inline load). Session page renders header, view toggle, ActiveSessionPanel, SessionPlayersModal. Modal can add/remove participants; after refactor it batches invites on Done.
- **League flow:** League page → LeagueProvider → LeagueDashboard (tabs). Matches tab uses useActiveSession, useDataRefresh, useMatchOperations, useSessionEditing, etc.; ActiveSessionPanel and MatchesTable render sessions and matches. AddPlayersModal adds members one-by-one via addLeagueMember.
- **Constants:** Filter-style options (with “All”) and form-style options (with “Select…”) live in `playerFilterOptions.js` for session and league create/details. Profile form still uses `playerFormConstants.js` (gender/level with different labels and AA).
- **Modals:** Large modals (AddMatch, PhotoMatchReview, UploadPhoto) are single-file; Session Players after refactor is split into container, panels, and hook. AddPlayersModal is a single file with submit loop.

---

## Related research

- None in this repo yet. This document can serve as the baseline for “UI refactor opportunities” and “batch API patterns.”

---

## Open questions

- **Backend:** Is there an existing “add multiple league members” or “invite many to league” endpoint, or would a new batch route be required? (If not, P1 batch league members depends on adding one.)
- **Product:** Should AddPlayersModal (league) support filters (location/league/gender/level) like Session Add panel, or stay search-only?
- **Scope:** Whether to introduce SessionContent (or similar) for the session page is optional and depends on plans for more session-type views.
- **Performance:** Do we want a lightweight performance baseline (e.g. Lighthouse or a single E2E timing) for session page and modal open so refactors can be checked for regression?
