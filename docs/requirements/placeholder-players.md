# Feature: Placeholder Players & Invite-to-Claim Flow

**Date:** 2026-02-15
**Status:** Complete (Epics 1-7 done; 4.3 PhoneNumberPrompt deferred to follow-up)

## Problem Statement

Users frequently want to log matches immediately after playing, but their opponents/partners haven't signed up for Beach Kings yet. Currently, the only option is to send them the app URL, wait for them to create an account, and then go back and create the match — by which point motivation is lost. This friction is a major adoption blocker for both league and casual/pickup play. This feature allows users to create "placeholder" players inline during match logging, invite them to join via a shareable link, and automatically link their matches when they sign up.

## Success Criteria

- A user can create a match where 1-4 players are placeholders (not yet registered)
- Placeholder players are real `players` table rows with `user_id=NULL`, distinguished by metadata
- Season standings (points, wins, losses) are computed immediately for all players, including placeholders
- Global ELO is deferred for placeholder players until they are claimed (matches with placeholders are marked `is_ranked=false` until all players are linked)
- A unique, non-expiring invite link is generated per placeholder player
- The invite link leads to a landing page showing match context, then routes to signup/login
- After signup or login, the placeholder is automatically linked to the user's account
- If the claiming user already has a player record, matches are merged into their existing record
- The placeholder creator is notified when their invite is claimed
- An immediate ELO recalculation is triggered on claim, retroactively computing ratings for the now-linked matches

## Scope

### In Scope

- Inline placeholder player creation in PlayerDropdown during match logging
- Optional phone number collection after placeholder creation (stored for display, not SMS)
- Unique invite link generation per placeholder
- Invite link landing page showing match context (count, league name, inviter name)
- Claim flow via signup OR login → auto-link
- Match merge when claiming user already has a player record
- Immediate global + league ELO recalculation on claim
- Re-marking affected matches as `is_ranked=true` after all players in a match are linked
- Subtle visual indicator for placeholder players in match/session/league UIs
- Reusable placeholders across multiple matches (same dropdown, mixed in with real players)
- Lightweight "Pending Invites" section in user profile (list, copy link, status)
- Placeholder deletion by creator (replaces placeholder with system "Unknown Player" in affected matches; does not delete matches)
- Notification to creator when a placeholder is claimed

### Out of Scope

- Bulk/CSV import of players
- SMS or email sending from our system (user copies link manually)
- Auto-matching placeholders to new signups by name
- Merging two existing (non-placeholder) player records
- Admin tools for managing all placeholders system-wide

## User Flow

### Creating a Match with a Placeholder

1. User opens AddMatchModal (league or pickup context)
2. In a PlayerDropdown, user types a name that doesn't match any existing player
3. Dropdown shows an "Add [typed name]" option at the bottom, visually distinct
4. User clicks "Add [name]" — a placeholder player is created immediately via API
5. A small inline prompt appears asking for an optional phone number (for the creator's reference)
6. User can dismiss or enter a phone number and confirm
7. The placeholder appears as the selected player in the dropdown, with a subtle "invite pending" indicator
8. User completes the match form as normal and submits
9. Match is created. If any player is a placeholder, the match is saved with `is_ranked=false`
10. After match creation, a toast/prompt offers to copy the invite link for any placeholder players in the match

### Reusing a Placeholder in Future Matches

1. User opens PlayerDropdown in a new match
2. Types the name of a previously created placeholder
3. The existing placeholder appears in dropdown results with the same "invite pending" indicator
4. User selects it — no new placeholder is created
5. **Scoping rules for which placeholders appear:**
   - In league context: placeholders that appear in matches within that league, OR created by the current user
   - In pickup/session context: placeholders created by the current user, OR already participants in the session

### Inviting the Placeholder to Join

1. After match creation, user copies the invite link (from toast, match detail view, or profile "Pending Invites")
2. User pastes the link into a text message, WhatsApp, etc. and sends it manually
3. The link format: `https://beachkings.com/invite/{token}`

### Claim Flow (Invited Person's Perspective)

1. Recipient clicks the invite link
2. Landing page shows: inviter's name, number of matches they're in, league name(s) if applicable
3. CTA: "Sign Up to Claim Your Matches" / "Already have an account? Log In"
4. **New user path**: Clicks signup → completes normal signup flow → on verification, system checks for pending invite token → shows confirmation page ("Claim these X matches as yours?") → user confirms → links placeholder to new user
5. **Existing user path**: Clicks login → logs in → system checks for pending invite token → shows confirmation page ("Claim these X matches as yours?") → user confirms → merges placeholder into their existing player record
6. **Already logged in path**: User is already logged in when they click invite link → landing page shows match context + "Claim These Matches" button → user confirms → claim/merge executes
7. After linking/merge, user sees their matches and (once recalc completes) their ELO rating

### Merge Flow (Existing Player)

1. Claiming user already has a player record (player ID = X)
2. Placeholder has player ID = Y with N matches
3. All matches referencing player Y are updated to reference player X (all 4 player FK columns checked)
4. All session_participants referencing player Y are updated to player X (skip if duplicate with existing participant)
5. League memberships: for each league the placeholder belongs to, transfer membership to player X if they're not already a member; delete the placeholder's membership if they are
6. Placeholder player record Y is deleted
7. Any matches where all 4 players are now linked users (no `is_placeholder=true`) have `is_ranked` set to `true`
8. Global + league stats recalculation is enqueued for each affected league
9. Creator of the placeholder receives a notification: "[Name] has joined Beach Kings and claimed their matches!"

### Managing Invites (Profile Section)

1. User navigates to their profile
2. "Pending Invites" section shows a list of placeholders they created
3. Each row shows: name, phone (if provided), # of matches, created date, status (pending/claimed)
4. Actions: copy invite link, delete placeholder
5. Deleting a placeholder replaces them with "Unknown Player" in all their matches, invalidates the invite link, and deletes the placeholder player record. Affected matches are preserved but become permanently unranked. Confirmation dialog shows the number of affected matches.

## Technical Design

### Data Model

#### Modified: `players` table

| Column | Type | Change | Notes |
|---|---|---|---|
| `is_placeholder` | Boolean | **ADD** | Default `false`. `true` for placeholder players |
| `created_by_player_id` | Integer FK → players.id | **ADD** | Nullable. The player who created this placeholder |
> Note: `user_id` is already nullable — placeholders naturally have `user_id=NULL`.

#### New: `player_invites` table

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `player_id` | Integer FK → players.id | The placeholder player |
| `invite_token` | String(64) | Unique, URL-safe token (e.g., `secrets.token_urlsafe(32)`) |
| `created_by_player_id` | Integer FK → players.id | Who created the invite |
| `phone_number` | String | Nullable. Optional phone stored during placeholder creation (creator's reference only) |
| `status` | Enum: `pending`, `claimed` | |
| `claimed_by_user_id` | Integer FK → users.id | Nullable. Set when claimed |
| `claimed_at` | DateTime | Nullable |
| `created_at` | DateTime | Server default |

> Invite links never expire. One invite per placeholder player (1:1 relationship, but separate table for clean separation).

#### System: "Unknown Player" record

A single system-level player record with `full_name="Unknown Player"`, `is_placeholder=false`, `user_id=NULL`. Created once via migration. Used as a replacement when a placeholder is deleted — matches are preserved with this player substituted in. This player is excluded from all stats calculations and search results.

#### Modified: `matches` table

No schema changes needed. The existing `is_ranked` boolean (default `true`) will be set to `false` for matches containing placeholder players, and flipped to `true` when all players in the match are linked.

#### League membership for placeholders

When a placeholder is used in a league match, a `LeagueMember` row is created for them automatically (role: `"placeholder"`). This ensures they appear in season standings. On claim/merge:
- **If claiming user is NOT already a league member**: update the `LeagueMember.player_id` from placeholder to claiming user's player ID, change role to `"member"`
- **If claiming user IS already a league member**: delete the placeholder's `LeagueMember` row (the claiming user's existing membership is preserved)

#### Modified: `notifications` table

| Column | Type | Change | Notes |
|---|---|---|---|
| (existing) | | | Add new notification type: `PLACEHOLDER_CLAIMED` |

### API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/players/placeholder` | Create a placeholder player (name, optional phone) | Authenticated |
| `GET` | `/api/players/placeholder` | List placeholders created by the current user | Authenticated |
| `DELETE` | `/api/players/placeholder/{player_id}` | Delete a placeholder (replace with Unknown Player in matches) | Authenticated (creator only) |
| `GET` | `/api/invites/{token}` | Get invite details for landing page (public-facing, limited data) | **Public** |
| `POST` | `/api/invites/{token}/claim` | Claim a placeholder (link to current user) | Authenticated |
| `GET` | `/api/players/search` | **Modify existing** — include placeholders scoped to context | Authenticated |

#### `POST /api/players/placeholder`

**Request:**
```json
{
  "name": "John Smith",
  "phone_number": "+15551234567",  // optional
  "league_id": 12                  // optional — if provided, placeholder is added as league member
}
```

**Response:**
```json
{
  "player_id": 456,
  "name": "John Smith",
  "invite_token": "abc123...",
  "invite_url": "https://beachkings.com/invite/abc123..."
}
```

**Logic:**
1. Create player with `is_placeholder=true`, `created_by_player_id=current_user.player_id`, `user_id=NULL`
2. Create `player_invites` row with a unique token (and optional `phone_number`)
3. If in league context, create `LeagueMember` row with role `"placeholder"`
4. Return player ID + invite URL

#### `GET /api/invites/{token}`

**Response (public, limited data):**
```json
{
  "inviter_name": "Patrick",
  "placeholder_name": "John Smith",
  "match_count": 3,
  "league_names": ["SD Beach League"],
  "status": "pending"
}
```

#### `POST /api/invites/{token}/claim`

**Logic:**
1. Look up invite by token, verify status is `pending`
2. Get the authenticated user's player ID
3. **If user has no existing player record**: set `user_id` on the placeholder player, set `is_placeholder=false`
4. **If user already has a player record**: run the merge flow (update all match FKs, session_participants, then delete placeholder)
5. Update any matches where all 4 players are now linked → set `is_ranked=true`
6. Update invite status to `claimed`, set `claimed_by_user_id` and `claimed_at`
7. Enqueue global + league stats recalculation jobs
8. Create notification for the invite creator
9. Return success with redirect URL

### Frontend Components

#### New Components

| Component | Location | Responsibility |
|---|---|---|
| `InviteLandingPage` | `pages/invite/[token].jsx` | Public landing page for invite links. Shows match context, CTA to signup/login |
| `PlaceholderBadge` | `components/player/PlaceholderBadge.jsx` | Small "Invite pending" indicator badge/icon |
| `PendingInvitesSection` | `components/profile/PendingInvitesSection.jsx` | Profile section listing user's created placeholders with actions |
| `PhoneNumberPrompt` | `components/player/PhoneNumberPrompt.jsx` | Inline prompt after placeholder creation for optional phone input |

#### Modified Components

| Component | Changes |
|---|---|
| `PlayerDropdown` | Add "Add [name]" option when no match found. Show `PlaceholderBadge` next to placeholder players. |
| `AddMatchModal` | After submit with placeholders, show toast with invite link copy option. Set `is_ranked=false` when placeholders present. |
| `AuthPage` (signup/login) | Accept invite token from URL params. After auth, trigger claim API call. |
| `ProfilePage` | Add `PendingInvitesSection` |
| `MatchCard` / match display components | Show `PlaceholderBadge` next to placeholder player names |

## Edge Cases & Error Handling

- **Duplicate placeholder names**: Allow it. Two different people can have the same name. Each gets their own player record and invite token. The creator should be able to distinguish by context (which match they're in) or phone number.
- **Placeholder creator deletes their own account**: Placeholders they created remain (they're standalone player records). Invite links still work. The `created_by_player_id` becomes a dangling reference — handle gracefully with ON DELETE SET NULL.
- **Invite token claimed twice**: Reject with clear error message. Once claimed, the token is consumed.
- **User tries to claim their own placeholder**: Allow it (edge case where someone creates a placeholder for themselves by mistake, then signs up). The merge flow handles it.
- **Match with 2+ placeholders — one claims, others don't**: Match stays `is_ranked=false` until ALL placeholder players in that match are claimed. Season points still count for everyone.
- **Placeholder appears in matches across multiple leagues**: On claim, stats recalc is triggered for global AND for each affected league.
- **Creator deletes a placeholder that's in submitted sessions**: Placeholder is replaced with "Unknown Player" in all affected matches. Matches become permanently unranked. Session stats are recalculated. Confirmation dialog warns about the number of affected matches.
- **Race condition: two users create placeholder with same name simultaneously**: Both succeed — they're separate player records. This is fine since we don't deduplicate by name.
- **Invite link visited when already logged in**: Show landing page with match context and a "Claim These Matches" confirmation button. Do NOT auto-claim — the user must confirm (prevents accidental claims from misclicked links).
- **Claiming user is already in the same match as the placeholder**: Block the claim for that specific match (a player can't appear twice in the same match). Show an error explaining the conflict and which match(es) are affected. The claim proceeds for non-conflicting matches, and conflicting matches retain the placeholder.
- **Placeholder used in league match but league is invite-only**: Placeholder is added as a league member with role `"placeholder"` regardless of league join settings. This bypasses the invite-only restriction since the league match creator implicitly vouches for them.
- **Duplicate league membership on merge**: If claiming user is already a member of a league the placeholder belongs to, the placeholder's `LeagueMember` row is deleted (no duplicate). The claiming user's existing role is preserved.

## UI/UX Notes

- **PlaceholderBadge**: Small, non-intrusive. Could be a dotted-border avatar with a small clock/invite icon, or a text tag like "Pending" in `var(--ocean-gray)`. Should use existing badge patterns (`border-radius: 12px`, `background: var(--gray-200)`).
- **"Add [name]" dropdown option**: Styled differently from regular player options — perhaps with a `+` icon and slightly muted text. Should feel like a deliberate action, not an accidental click.
- **Phone number prompt**: Appears inline below the dropdown after creating a placeholder. Small, dismissible, with a text input and "Save" / "Skip" buttons. Not a modal — stays in flow.
- **Invite link toast after match creation**: Standard toast notification with a "Copy Link" button. Appears for each placeholder in the match. Auto-dismisses after 10s but stays if user interacts.
- **Pending Invites section**: Card-based list. Each card shows: avatar placeholder (initials), name, phone (from `player_invites.phone_number` if provided), "X matches" count, "Copy Link" button, "Delete" button with confirmation.
- **Invite landing page**: Clean, branded page. Shows Beach Kings logo, inviter name, match count, league names. Large CTA buttons for "Sign Up" and "Log In". Mobile-optimized (most people will receive the link via text).

## Testing Plan

### Priority 1 — Critical Path
- Create a placeholder player via PlayerDropdown inline creation
- Create a match with 1 placeholder + 3 real players → verify `is_ranked=false`
- Generate invite link → visit landing page → verify match context is shown
- New user claims invite → verify placeholder linked, `is_ranked` flipped, ELO recalculated
- Existing user claims invite → verify merge (matches transferred, placeholder deleted, ELO recalculated)

### Priority 2 — Core Flows
- Reuse an existing placeholder in a second match
- Placeholder appears scoped correctly in league vs pickup PlayerDropdown
- Season standings include placeholder players' points immediately
- Creator sees placeholder in "Pending Invites" profile section
- Creator copies invite link from profile section
- Creator deletes a placeholder → replaced with Unknown Player in matches, stats recalculated
- Notification delivered to creator on claim

### Priority 3 — Edge Cases
- Match with all 4 players as placeholders
- Match with 2 placeholders — claim one, verify match stays `is_ranked=false`
- Claim second placeholder → verify match flips to `is_ranked=true`
- Duplicate placeholder names (same name, different placeholders)
- Already-logged-in user visits invite link → confirmation screen → claim on confirm
- Claimed invite token visited again → error message
- Delete placeholder that appears in submitted sessions → replaced with Unknown Player, stats recalc
- Claiming user already in same match as placeholder → conflict handled gracefully
- Placeholder in league → auto-added as league member, membership transferred or cleaned up on merge

## Implementation Plan

### Epic 1: Schema & Migrations ✅
> Foundation layer. No user-facing changes — just database scaffolding.

- [x] **1.1** Migration: add `is_placeholder` (bool, default false) and `created_by_player_id` (FK → players.id, nullable, ON DELETE SET NULL) to `players` table
- [x] **1.2** Migration: create `player_invites` table (id, player_id, invite_token, created_by_player_id, phone_number, status, claimed_by_user_id, claimed_at, created_at)
- [x] **1.3** Migration: insert system "Unknown Player" record (full_name="Unknown Player", is_placeholder=false, user_id=NULL, status="system"). Discoverable by `WHERE full_name='Unknown Player' AND status='system'`.
- [x] **1.4** Migration: add `PLACEHOLDER_CLAIMED` to notification types — added to `NotificationType` enum in `models.py`. Notifications use string-based types so no DDL needed.
- [x] **1.5** Add `PlayerInvite` ORM model + relationships in `models.py`. Added `InviteStatus` enum. Added `is_placeholder`, `created_by_player_id` to `Player` model with relationships (`invite`, `created_by`, `created_placeholders`). Added Pydantic schemas for placeholder CRUD and invite endpoints.
- [x] **1.6** Unit tests: 18 tests in `test_placeholder_models.py` — covers defaults, FK ON DELETE SET NULL, unique token, 1:1 invite↔player, CASCADE on player delete, check constraint, relationships, enum values, Unknown Player conventions, duplicate names.

**Implementation notes:**
- Migration: `017_add_placeholder_players_and_invites.py` — single migration for all schema changes
- `PlayerInvite.player_id` FK uses `ondelete="CASCADE"` (deleting placeholder deletes invite)
- `PlayerInvite.created_by_player_id` FK uses `ondelete="SET NULL"` (creator deletion doesn't affect invite)
- All 391 backend tests pass (18 new + 373 existing, 0 regressions)

**Depends on:** nothing
**Unlocks:** Epics 2 and 3

---

### Epic 2: Backend — Placeholder CRUD ✅
> Create, list, delete, and search placeholder players. The core backend for the inline creation flow.

- [x] **2.1** `POST /api/players/placeholder` — create placeholder player + invite token. Accept `name`, optional `phone_number`, optional `league_id`. If `league_id` provided, create `LeagueMember` with role `"placeholder"`
- [x] **2.2** `GET /api/players/placeholder` — list current user's created placeholders with invite status, match count, phone
- [x] **2.3** `DELETE /api/players/placeholder/{player_id}` — creator-only. Replace placeholder with Unknown Player in all matches (update all 4 player FK columns where they match). Invalidate invite. Delete placeholder's `LeagueMember` rows. Recalculate affected session/league stats. Return count of affected matches.
- [x] **2.4** Modify player search/list endpoints — include placeholders scoped by context (league_id, session_id, or created_by). Add `is_placeholder` flag to player response DTOs.
- [x] **2.5** Modify `POST /api/matches` — when any of the 4 player IDs is a placeholder (`is_placeholder=true`), force `is_ranked=false` on the created match regardless of the request payload
- [x] **2.6** Unit tests for all CRUD operations, scoping logic, is_ranked enforcement (27 tests in `test_placeholder_crud.py`)

**Implementation notes:**
- Service layer: `placeholder_service.py` — `create_placeholder`, `list_placeholders`, `delete_placeholder`, `check_match_has_placeholders`
- Player search scoping: `list_players_search` in `data_service.py` supports `include_placeholders_for_player_id` + `session_id` params
- All 445 backend tests pass (27 new + 418 existing, 0 regressions)

**Depends on:** Epic 1
**Unlocks:** Epic 4

---

### Epic 3: Backend — Claim & Merge ✅
> The most complex backend epic. Handles linking, merging, ELO backfill, and notifications.

- [x] **3.1** `GET /api/invites/{token}` — public endpoint. Return inviter name, placeholder name, match count, league names, status. Limit data exposure (no scores, no opponent names).
- [x] **3.2** `POST /api/invites/{token}/claim` — core claim logic (all paths implemented)
- [x] **3.3** Data service helper: `merge_placeholder_into_player(session, placeholder_id, target_player_id)` — encapsulates all FK updates, membership transfers, and cleanup in a single transaction
- [x] **3.4** Data service helper: `flip_ranked_status_for_resolved_matches(session, player_id)` — find matches that previously had a placeholder but now all 4 players are linked, set `is_ranked=true`
- [x] **3.5** Unit tests: 27 tests in `test_placeholder_claim.py` — covers all claim/merge paths, conflicts, ranked flip, league membership transfer, notification creation, stats recalc

**Implementation notes:**
- All claim/merge logic in `placeholder_service.py` (`claim_invite`, `merge_placeholder_into_player`, `flip_ranked_status_for_resolved_matches`, `get_invite_details`)
- Conflict detection: merge skips matches where both placeholder and target appear; returns warnings
- Stats recalc enqueued via `stats_queue` for global + per-league
- Notification: `PLACEHOLDER_CLAIMED` type created for invite creator

**Depends on:** Epic 1
**Unlocks:** Epic 6

---

### Epic 4: Frontend — Inline Creation & Match Flow ✅
> The primary UX change users will see first. Modifies the match creation flow.

- [x] **4.1** `PlaceholderBadge` component — small "Pending" tag (`var(--gray-200)` bg, `var(--ocean-gray)` text, 8px border-radius). File: `components/player/PlaceholderBadge.jsx`
- [x] **4.2** Modify `PlayerDropdown` — "Add [typed name]" option at bottom with `+` icon when search yields no results (min 2 chars). Accepts `onCreatePlaceholder` async callback. Shows `PlaceholderBadge` next to placeholder players in list. Keyboard nav (ArrowDown/Enter) works with the create option.
- [ ] **4.3** `PhoneNumberPrompt` component — **DEFERRED**. Requires a `PATCH /api/invites/{id}` endpoint that doesn't exist yet. Phone can be passed during creation via the existing `POST` endpoint; the inline prompt UX will be added in a follow-up.
- [x] **4.4** Modify `AddMatchModal` — after submitting a match with placeholder(s), show a toast per placeholder with "Copy Link" button. Auto-dismiss after 10s. Uses new `Toast` / `ToastContainer` / `useToasts` components. Local `localPlaceholders` state merged into `playerOptions` via `usePlayerMappings`.
- [x] **4.5** Modify `MatchCard` — show `PlaceholderBadge` next to placeholder player names using `IsPlaceholder` flags in display format.
- [x] **4.6** Add `createPlaceholderPlayer`, `listPlaceholderPlayers`, `deletePlaceholderPlayer`, `getInviteDetails`, `claimInvite` to `api.js` service layer.
- [x] **4.7** Wire up placeholder display in `usePlayerMappings` (carries `isPlaceholder` flag, merges `localPlaceholders`), `usePickupSession` (builds `placeholderPlayerIds` set for match transforms), and `LeagueMatchesTab` (passes `placeholderPlayerIds` to `transformMatchData`).

**Implementation notes:**
- Backend: Added `is_placeholder` to `list_league_members` and `get_session_participants` responses
- New reusable `Toast` component: `components/ui/Toast.jsx` (Toast, ToastContainer, useToasts hook)
- `matchUtils.js`: Added `buildPlaceholderIdSet()` helper and optional `placeholderPlayerIds` param to `transformMatchData` / `sessionMatchToDisplayFormat`
- All 445 backend tests pass, frontend build compiles cleanly

**Depends on:** Epic 2
**Unlocks:** can be used independently (placeholders work without claim flow)

---

### Epic 5: Frontend — Invite Landing & Claim Flow ✅
> The invited person's experience — from clicking the link to claiming their matches.

- [x] **5.1** `InviteLandingPage` at `app/invite/[token]/page.jsx` — public page. Calls `GET /api/invites/{token}`. Shows: Beach Kings logo, inviter name, match count, league names. States: not logged in (Sign Up / Log In CTAs), logged in (Claim My Matches), already claimed (info message), loading (skeleton), error (invalid token), claiming (spinner), success (checkmark + warnings), claim error (retry).
- [x] **5.2** Auth flow integration — uses global `AuthModal` via `useAuthModal()` context. No sessionStorage, URL params, or redirects needed. User stays on `/invite/[token]` throughout — after auth completes, `isAuthenticated` flips true reactively, page re-renders to show claim UI. Profile-completion modal suppressed via no-op `onVerifySuccess` callback.
- [x] **5.3** Claim confirmation UI — authenticated users see invite context + "Claim My Matches" button + Cancel. On confirm, calls `POST /api/invites/{token}/claim`. Success state shows checkmark + message + "Go to Home" button.
- [x] **5.4** Handle claim response warnings — if `claimResult.warnings` is non-empty, a `var(--sun-gold-light)` warning box displays the list of issues (e.g., conflicting matches).
- [x] **5.5** NavBar always rendered on InviteLandingPage. Shows unauthenticated state (Sign In/Sign Up) or authenticated state with user leagues. Same pattern as landing page.

**Implementation notes:**
- Single `'use client'` component at `app/invite/[token]/page.jsx` using Next.js App Router dynamic segments
- State machine: `pageState` (loading → loaded | error), `claimState` (idle → claiming → success | error), plus `invite.status` and `isAuthenticated`
- Reuses global `AuthModal` from `ClientProviders` — no per-page modal rendering needed
- `openAuthModal('sign-up', noOpVerifySuccess)` suppresses profile-completion modal after signup
- CSS: BEM-style `.invite-page` block with ~170 lines in App.css. Mobile-first, max-width 480px card. Uses design tokens exclusively (no hard-coded colors).
- Loading skeleton with pulse animation, inline spinner for claiming state
- Warning box uses `var(--sun-gold-light)` background for claim conflict display

**Depends on:** Epic 3
**Unlocks:** Epic 6

---

### Epic 6: Frontend — Profile Management ✅
> Dedicated "Pending Invites" tab for managing created placeholders.

- [x] **6.1** `PendingInvitesTab` component — card list. Each card: initials avatar, name, phone (if any), "X matches" badge, created date. Actions: "Copy Link" button, "Delete" button. Loading/empty/error states.
- [x] **6.2** Delete confirmation using existing `ConfirmationModal` (danger variant) — warns "This will replace [name] with 'Unknown Player' in X matches. Those matches will become permanently unranked. This cannot be undone." Confirm/Cancel.
- [x] **6.3** Integrated as its own tab in the Home dashboard — accessible via desktop sidebar (secondary items) and mobile "More" menu. Shows only pending invites (claimed placeholders become normal players, so no toggle needed until OQ-1 is resolved).
- [x] **6.4** Copy link interaction — `navigator.clipboard.writeText()` with inline "Copied!" button feedback (2s) and toast fallback on error.

**Implementation notes:**
- Component: `components/home/PendingInvitesTab.jsx` — standalone tab (not embedded in ProfileTab)
- Navigation: added `invites` tab to `HomeMenuBar` items (desktop sidebar + More menu on mobile)
- CSS: BEM `.pending-invites__*` classes in App.css (~150 lines), mobile-responsive at 480px breakpoint
- Reuses: `ConfirmationModal`, `Button` (outline/ghost variants), `Toast`/`useToasts`
- Design decision: own tab (not profile section) keeps ProfileTab focused; matches Friends/Notifications pattern
- Design decision: pending-only view (no claimed toggle) since claimed placeholders are either adopted or merged+deleted (OQ-1)
- Frontend build compiles cleanly, no regressions

**Depends on:** Epics 2 + 5 (needs placeholder CRUD + claim status to display correctly)
**Unlocks:** Epic 7

---

### Epic 7: Integration Testing & Polish ✅
> End-to-end validation and edge case hardening.

- [x] **7.1** E2E test: create placeholder → create match → verify is_ranked=false → claim invite → verify is_ranked flipped → verify ELO computed — **DONE**: tests A+B in `placeholder-crud.spec.js`, test E in `placeholder-claim.spec.js`
- [x] **7.2** E2E test: create placeholder → create match → existing user claims → verify merge (matches transferred, placeholder deleted) — **DONE**: test F in `placeholder-claim.spec.js`
- [x] **7.3** E2E test: delete placeholder → verify Unknown Player substitution → verify matches preserved — **DONE**: test C in `placeholder-crud.spec.js`
- [x] **7.4** E2E test: reuse placeholder across multiple matches → claim → all matches updated — **DONE**: test G in `placeholder-claim.spec.js`
- [x] **7.5** E2E test: placeholder in league match → season standings include them → claim → league membership resolved — **DONE**: test I in `placeholder-edge-cases.spec.js`
- [x] **7.6** Edge case tests: duplicate in same match, claimed token reuse, already-logged-in claim — **DONE**: tests H, J, K, L, M across `placeholder-claim.spec.js` and `placeholder-edge-cases.spec.js`
- [x] **7.7** Filter "Unknown Player" from stats calculations, search results, player lists — **DONE**: `get_matches_for_calculation` filters `is_ranked=True`; Unknown Player excluded from search via `status='system'` filter in `data_service.py`
- [x] **7.8** Verify placeholder players excluded from global player search/rankings but visible in scoped contexts — **DONE**: scoping logic in `data_service.py` (`include_placeholders_for_player_id` with league/session context)
- [x] **7.9** Mobile responsiveness pass on InviteLandingPage — **DONE**: CSS has mobile-first styles (`max-width: 480px` card, responsive CTA buttons)

**Implementation notes:**
- 13 E2E tests across 3 spec files: `placeholder-crud.spec.js` (4), `placeholder-claim.spec.js` (4), `placeholder-edge-cases.spec.js` (5)
- Test fixtures: `secondTestUser`, `leagueWithPlaceholder` in `test-fixtures.js`; helpers in `test-helpers.js`
- Page object: `InvitePage.js` covers authenticated/unauthenticated navigation, claim flow, error states
- Cleanup: `db.js` extended to handle placeholder players, invites, and stale match FKs

**Depends on:** All previous epics
**Status:** Complete

---

### Suggested Implementation Order

```
Epic 1 (Schema)
  ├── Epic 2 (Backend CRUD)  ─── Epic 4 (Frontend Creation)
  │                                       │
  └── Epic 3 (Backend Claim) ─── Epic 5 (Frontend Claim) ─── Epic 6 (Profile Mgmt)
                                                                       │
                                                               Epic 7 (Testing)
```

Epics 2+3 can be built in parallel (both only depend on Epic 1). Epics 4+5 can start as soon as their respective backend epic is done. Epic 6 needs both the CRUD API and the claim status. Epic 7 is last.

**Estimated scope:** ~35 tasks across 7 epics. Each epic is independently demoable/testable.

## Open Questions

### OQ-1: Invite record lost on merge when placeholder is deleted

**Context:** In the merge path (claiming user already has a player), when no conflicting matches exist, `merge_placeholder_into_player` deletes the placeholder Player row. Because `PlayerInvite.player_id` uses `ondelete="CASCADE"`, this cascade-deletes the invite record — even though `claim_invite` updates the invite to `status=claimed` in the same transaction, the row is gone at commit time.

**Impact:** No audit trail for claimed invites in the merge path. The "new user" path (placeholder adopted in place, no deletion) preserves the invite correctly.

**Recommendation:** Change the merge function to **not delete the placeholder** when it has an associated invite. Instead, mark it with a `status="merged"` or similar, and set `is_placeholder=False`, `user_id=NULL`. This preserves the invite chain (`PlayerInvite` → `Player`) for auditing while removing the placeholder from active use. Alternatively, move the invite FK to `ondelete="SET NULL"` so the invite survives placeholder deletion — but a dangling invite with no player is less useful than a preserved-but-inactive placeholder.

**Decision:** **RESOLVED.** Fixed in `merge_placeholder_into_player`: before deleting the placeholder, `PlayerInvite.player_id` is repointed to the target player. This prevents the CASCADE from deleting the invite row, preserving the audit trail.
