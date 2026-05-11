# Add Games Tab — Navigation & Flow Validation

> Test cases for the four Add Games entry flows (league with/without active session, pickup with/without active session). Use for manual QA and E2E test development.

**Last updated:** 2026-05-09  
**Scope:** Phase 4 — Add Games Tab (Sessions & Score Entry)  
**Related:** MOBILE_APP_SPEC.md § Phase 4

---

## Overview: Four Entry Flows

| Flow | Entry Point | Session State | Score-Game Params | Expected Behavior |
|------|-------------|---------------|-------------------|-------------------|
| **Flow 1** | League with active session | Continues existing | `sessionId`, `leagueId`, `seasonId` | "Continue" button → score-game with pre-filled rosters |
| **Flow 2** | League without active session | Creates new | `leagueId`, `seasonId`, `sessionId=null` | "New Session" button → score-game, lazy session create |
| **Flow 3** | Pickup with active session | Continues existing | `sessionId`, `leagueId=null` | "Continue Pickup Session" banner → score-game |
| **Flow 4** | Pickup without active session | Creates new | `sessionId=null`, `leagueId=null` | "Pickup Play" button → score-game, lazy session create |

---

## Test Setup & Prerequisites

### Test User & League Setup

Before running tests, ensure:
- [ ] Test user created with completed profile (gender, level, location_id)
- [ ] At least one league exists with multiple players
- [ ] At least one season exists in that league with status `ACTIVE`
- [ ] Test user is a member of the league

**Quick Setup:**
```bash
make seed-users  # Creates 3 test users (password: test1234)
# Then manually create a league + season via mobile UI, or use backend API
```

### Session States for Testing

| State | How to Create | For Testing |
|-------|---------------|-------------|
| **ACTIVE session (league)** | Submit a match in a league | Flow 1 (league-continue) |
| **DRAFT session (empty)** | Tap "Manage Session" but don't add matches | Flow 2 (post-Manage, pre-match) |
| **No session** | Default state on first app open | Flow 2, 4 (league-new, pickup-new) |
| **ACTIVE session (pickup)** | Submit a match with no league context | Flow 3 (pickup-continue) |

---

## Flow 1: League Game with Active Session (league-continue)

### Preconditions
- User logged in
- User is member of a league with at least one active season
- At least one ACTIVE session exists in that season (from prior match)
- Session has 2+ players in roster

### Test Case 1.1: Open Score-Game from Active League Session

**Steps:**
1. Navigate to "Add Games" tab
2. Scroll to league section → find league with active session badge
3. Tap "Continue Session" button on league card
4. Verify score-game screen loads

**Expected Outcome:**
- ✅ Route params: `sessionId`, `leagueId`, `seasonId` present
- ✅ Header shows league name + "Continue Session"
- ✅ Team/player rosters pre-filled from league members
- ✅ Three-dot menu (⋮) visible with "Manage Session" and "Share" options
- ✅ "Save Game" button present
- ✅ "X" (close) button present in header

**E2E Test Name:** `test_flow1_1_open_active_league_session`

---

### Test Case 1.2: Save Match in Active Session

**Steps:**
1. From Flow 1.1, fill in score entry (both teams, final score)
2. Tap "Save Game" button
3. Observe navigation + screen state

**Expected Outcome:**
- ✅ Match created in backend (POST /api/matches with `session_id`, `league_id`)
- ✅ Routed to SessionDetailScreen with same `sessionId`
- ✅ Session displays with newly added match in match list
- ✅ Match shows both teams, final score, timestamp

**E2E Test Name:** `test_flow1_2_save_match_active_session`

---

### Test Case 1.3: Manage Session from Active League Session

**Steps:**
1. From score-game (Flow 1.1), tap three-dot menu (⋮)
2. Tap "Manage Session" option
3. Observe navigation + screen state

**Expected Outcome:**
- ✅ Routed to SessionDetailScreen (same session)
- ✅ Session title, roster, invite code all visible
- ✅ User can edit session details if needed
- ✅ User can share session code
- ✅ Tapping back/X returns to score-game (same form state, sessionId still in scope)

**E2E Test Name:** `test_flow1_3_manage_session_active_league`

---

### Test Case 1.4: Share Session from Active League Session

**Steps:**
1. From score-game (Flow 1.1), tap three-dot menu (⋮)
2. Tap "Share" option
3. Observe share sheet

**Expected Outcome:**
- ✅ Share sheet appears with session code / invite link
- ✅ User can copy link, send via SMS/WhatsApp/etc.
- ✅ Dismissing share sheet returns to score-game

**E2E Test Name:** `test_flow1_4_share_session_active_league`

---

### Test Case 1.5: Close Score-Game from Active Session (No Match Saved)

**Steps:**
1. From score-game (Flow 1.1), do NOT tap "Save Game"
2. Tap "X" (close) button in header
3. Observe navigation + session state

**Expected Outcome:**
- ✅ Routed to SessionDetailScreen (same session)
- ✅ No new match appears in session (nothing was saved)
- ✅ Session state unchanged from before score-game entry

**E2E Test Name:** `test_flow1_5_close_without_saving_active_league`

---

### Test Case 1.6: Device Back from Score-Game (No Match Saved)

**Steps:**
1. From score-game (Flow 1.1), do NOT tap "Save Game"
2. Tap device back button (or swipe back)
3. Observe navigation

**Expected Outcome:**
- ✅ Same as Test 1.5 (routed to SessionDetailScreen)
- ✅ No orphan state created

**E2E Test Name:** `test_flow1_6_device_back_active_league`

---

## Flow 2: League Game WITHOUT Active Session (league-new)

### Preconditions
- User logged in
- User is member of a league with at least one active season
- No ACTIVE session exists in that season yet
- League has 2+ members

### Test Case 2.1: Open Score-Game from New League Session

**Steps:**
1. Navigate to "Add Games" tab
2. Scroll to league section → find league WITHOUT active session badge
3. Tap "New Session" button (or tap league to show options, then "New Session")
4. Verify score-game screen loads

**Expected Outcome:**
- ✅ Route params: `leagueId`, `seasonId` present; `sessionId=null`
- ✅ Header shows "Create New Session" (or league name with "New")
- ✅ Three-dot menu (⋮) visible with "Manage Session" option (Share only available after session created)
- ✅ Score entry form ready for input
- ✅ "Save Game" button present
- ✅ "X" (close) button present in header

**E2E Test Name:** `test_flow2_1_open_new_league_session`

---

### Test Case 2.2: Save Match in New League Session (Auto-Create)

**Steps:**
1. From Flow 2.1, fill in score entry (both teams, final score)
2. Tap "Save Game" button without tapping "Manage Session" first
3. Observe backend + navigation

**Expected Outcome:**
- ✅ Backend auto-creates session on match POST (POST /api/matches with `league_id`, `season_id`, `session_id=null`)
- ✅ Response includes newly created `session_id`
- ✅ Routed to SessionDetailScreen with new session
- ✅ Match appears in session match list
- ✅ Session title is auto-generated (e.g., "League Name • [Date]")

**E2E Test Name:** `test_flow2_2_save_match_auto_creates_session`

---

### Test Case 2.3: Manage Session Before Saving (Explicit Create)

**Steps:**
1. From Flow 2.1, do NOT fill in score yet
2. Tap three-dot menu (⋮)
3. Tap "Manage Session"
4. Observe navigation + backend

**Expected Outcome:**
- ✅ Backend creates session (POST /api/sessions with `league_id`, `season_id`, title)
- ✅ Routed to SessionDetailScreen (new empty session)
- ✅ User can set session title, add/invite players
- ✅ Session code is displayed (shareable)
- ✅ Tapping back/X returns to score-game (sessionId now in scope)

**E2E Test Name:** `test_flow2_3_manage_session_explicit_create`

---

### Test Case 2.4: Manage Session, Then Save Match

**Steps:**
1. From Flow 2.1, tap three-dot menu (⋮)
2. Tap "Manage Session" → routed to SessionDetailScreen
3. Set session title (e.g., "Saturday Beach Volleyball")
4. Tap back to return to score-game
5. Fill in score entry
6. Tap "Save Game"

**Expected Outcome:**
- ✅ Session exists with custom title
- ✅ Match created in that session
- ✅ SessionDetailScreen displays with title + match
- ✅ "Share" option now available in score-game menu

**E2E Test Name:** `test_flow2_4_manage_then_save_match`

---

### Test Case 2.5: Close Without Saving, After Manage Session

**Steps:**
1. From Flow 2.1, tap "Manage Session" → session created + routed to SessionDetailScreen
2. Tap back to score-game
3. Do NOT fill in score entry
4. Tap "X" (close)

**Expected Outcome:**
- ✅ Routed to SessionDetailScreen (the session that was created in step 1)
- ✅ No match in session (nothing saved)
- ✅ Session persists (intentional create, so it should exist)

**E2E Test Name:** `test_flow2_5_close_after_manage_session`

---

### Test Case 2.6: Close Without Managing or Saving

**Steps:**
1. From Flow 2.1, do NOT tap "Manage Session"
2. Do NOT fill in score entry
3. Tap "X" (close)

**Expected Outcome:**
- ✅ Routed back to "Add Games" tab
- ✅ No session created (lazy create — nothing triggered it)
- ✅ Clean exit, no orphan state

**E2E Test Name:** `test_flow2_6_close_without_managing_or_saving`

---

### Test Case 2.7: Device Back Without Managing or Saving

**Steps:**
1. From Flow 2.1, do NOT tap "Manage Session"
2. Do NOT fill in score entry
3. Tap device back button

**Expected Outcome:**
- ✅ Same as Test 2.6 (back to Add Games, no session created)

**E2E Test Name:** `test_flow2_7_device_back_without_managing`

---

## Flow 3: Pickup Game with Active Pickup Session (pickup-continue)

### Preconditions
- User logged in
- At least one ACTIVE session exists with no `league_id` (pickup session)
- Session has 2+ players in roster
- Session code is generated and shareable

### Test Case 3.1: Continue Active Pickup Session from Banner

**Steps:**
1. Navigate to "Add Games" tab
2. Look for "Continue Pickup Session" banner at top of screen
3. Tap banner
4. Verify score-game screen loads

**Expected Outcome:**
- ✅ Route params: `sessionId` present; `leagueId=null`
- ✅ Header shows pickup session title (or "Pickup Session")
- ✅ Three-dot menu (⋮) visible with "Manage Session" and "Share" options
- ✅ Team/player rosters pre-filled from session roster
- ✅ Score entry form ready

**E2E Test Name:** `test_flow3_1_continue_active_pickup_session`

---

### Test Case 3.2: Save Match in Active Pickup Session

**Steps:**
1. From Flow 3.1, fill in score entry
2. Tap "Save Game"

**Expected Outcome:**
- ✅ Match created (POST /api/matches with `session_id`, `league_id=null`)
- ✅ Routed to SessionDetailScreen
- ✅ Match appears in pickup session
- ✅ Session code still visible for sharing

**E2E Test Name:** `test_flow3_2_save_match_active_pickup`

---

### Test Case 3.3: Manage Pickup Session

**Steps:**
1. From Flow 3.1, tap three-dot menu (⋮)
2. Tap "Manage Session"

**Expected Outcome:**
- ✅ Routed to SessionDetailScreen
- ✅ Can edit session title, roster, invite players
- ✅ Back to score-game returns focus to form

**E2E Test Name:** `test_flow3_3_manage_pickup_session`

---

### Test Case 3.4: Share Pickup Session

**Steps:**
1. From Flow 3.1, tap three-dot menu (⋮)
2. Tap "Share"

**Expected Outcome:**
- ✅ Share sheet with session code/link appears
- ✅ Can copy or share via messaging apps

**E2E Test Name:** `test_flow3_4_share_pickup_session`

---

### Test Case 3.5: Close Pickup Session Score-Game (No Match)

**Steps:**
1. From Flow 3.1, do NOT tap "Save Game"
2. Tap "X" (close)

**Expected Outcome:**
- ✅ Routed to SessionDetailScreen (same session)
- ✅ No new match created

**E2E Test Name:** `test_flow3_5_close_pickup_without_saving`

---

## Flow 4: Pickup Game WITHOUT Active Pickup Session (pickup-new)

### Preconditions
- User logged in
- No active pickup sessions exist
- User is ready to start a new pickup game

### Test Case 4.1: Open Score-Game for New Pickup Session

**Steps:**
1. Navigate to "Add Games" tab
2. Tap "Pickup Play" button (or "Start New Pickup Session")
3. Verify score-game screen loads

**Expected Outcome:**
- ✅ Route params: `sessionId=null`, `leagueId=null`
- ✅ Header shows "Create New Session" (or "New Pickup Game")
- ✅ Three-dot menu (⋮) visible with "Manage Session" option
- ✅ Score entry form ready (open rosters, user selects players)
- ✅ "Save Game" button present

**E2E Test Name:** `test_flow4_1_open_new_pickup_session`

---

### Test Case 4.2: Save Match in New Pickup Session (Auto-Create)

**Steps:**
1. From Flow 4.1, select teams and players
2. Fill in final score
3. Tap "Save Game" without tapping "Manage Session"

**Expected Outcome:**
- ✅ Backend auto-creates pickup session (POST /api/matches with `session_id=null`, `league_id=null`)
- ✅ Routed to SessionDetailScreen (new pickup session)
- ✅ Match appears in session
- ✅ Session title auto-generated
- ✅ Session code created for sharing

**E2E Test Name:** `test_flow4_2_save_pickup_match_auto_creates`

---

### Test Case 4.3: Manage Session Before Saving (Explicit Create)

**Steps:**
1. From Flow 4.1, do NOT fill in score
2. Tap three-dot menu (⋮)
3. Tap "Manage Session"

**Expected Outcome:**
- ✅ Backend creates pickup session (POST /api/sessions with no `league_id`)
- ✅ Routed to SessionDetailScreen
- ✅ User can set title, invite players, get session code
- ✅ Back returns to score-game (sessionId now in scope)

**E2E Test Name:** `test_flow4_3_manage_pickup_explicit_create`

---

### Test Case 4.4: Manage, Then Save Match in Pickup

**Steps:**
1. From Flow 4.1, tap "Manage Session" → SessionDetailScreen created
2. Set session title (e.g., "Tuesday Night Beach Pickup")
3. Back to score-game
4. Fill in score, tap "Save Game"

**Expected Outcome:**
- ✅ Session persists with custom title
- ✅ Match created in that session
- ✅ SessionDetailScreen displays title + match

**E2E Test Name:** `test_flow4_4_manage_then_save_pickup_match`

---

### Test Case 4.5: Close Without Saving or Managing

**Steps:**
1. From Flow 4.1, do NOT tap "Manage Session"
2. Do NOT fill in score
3. Tap "X" (close)

**Expected Outcome:**
- ✅ Routed back to "Add Games" tab
- ✅ No session created (clean exit)

**E2E Test Name:** `test_flow4_5_close_without_managing_pickup`

---

### Test Case 4.6: Device Back Without Saving or Managing

**Steps:**
1. From Flow 4.1, do NOT tap "Manage Session"
2. Do NOT fill in score
3. Tap device back button

**Expected Outcome:**
- ✅ Same as Test 4.5

**E2E Test Name:** `test_flow4_6_device_back_without_managing_pickup`

---

## Cross-Flow Edge Cases

### Test Case E1: Multiple Matches in Single Session ("Add Another" via SessionDetailScreen)

**Setup:** User has saved a match in a league session (Flow 1.2 or 2.2 outcome)

**Steps:**
1. From SessionDetailScreen (after saving match), look for "Add Game" button
2. Tap "Add Game"
3. Verify routed back to score-game with same `sessionId`

**Expected Outcome:**
- ✅ Routed to score-game with `sessionId` pre-filled
- ✅ Form is cleared (ready for next match)
- ✅ Same session title + roster still available
- ✅ Saving another match adds to same session

**E2E Test Name:** `test_cross_flow_e1_add_another_from_session_detail`

---

### Test Case E2: Empty Draft Session Appears in Banner

**Setup:** User tapped "Manage Session" (Flow 2.3 or 4.3) but never saved a match

**Steps:**
1. Navigate back to "Add Games" tab
2. Look for "Continue [Session Title]" banner or similar

**Expected Outcome:**
- ✅ Empty/draft session appears in banner or list (not filtered out)
- ✅ User can continue to score-game with same `sessionId`
- ✅ Can now add matches to this session

**E2E Test Name:** `test_cross_flow_e2_empty_draft_in_banner`

---

### Test Case E3: Session Created, Shared, Friend Joins, Score Entry Works

**Setup:** Two test users (A and B)

**Steps:**
1. User A: Create new pickup session (Flow 4.1–4.3) → get session code/link
2. User A: Share code with User B
3. User B: Open app → accept session invite or join via code
4. User B: Navigate to session detail
5. User A & B: Both enter from same session in Add Games tab
6. User A: Save a match (teams with both A + B)
7. Verify match appears in session for both users

**Expected Outcome:**
- ✅ Session sharing works (code/link valid)
- ✅ Friend join works (roster updated for both users)
- ✅ Both users see same session in Add Games
- ✅ Match created by A is visible to B (real-time or on refresh)

**E2E Test Name:** `test_cross_flow_e3_session_sharing_and_collab_scoring`

---

## Manual QA Checklist

Use this checklist for manual testing across all flows:

### Before Testing
- [ ] App build is fresh (run `npx expo start` or `eas build preview`)
- [ ] Test database seeded (leagues, seasons, players)
- [ ] Test user authenticated and profile complete
- [ ] Network connection stable (no throttling unless testing offline)

### Flow 1 (league-continue)
- [ ] [ ] 1.1 Open active session → params correct
- [ ] [ ] 1.2 Save match → SessionDetail shown
- [ ] [ ] 1.3 Manage Session → navigation correct
- [ ] [ ] 1.4 Share → share sheet works
- [ ] [ ] 1.5 Close without saving → no orphan state
- [ ] [ ] 1.6 Device back → same as 1.5

### Flow 2 (league-new)
- [ ] [ ] 2.1 Open score-game → params correct (sessionId=null)
- [ ] [ ] 2.2 Save without Manage → session auto-created
- [ ] [ ] 2.3 Manage → session created
- [ ] [ ] 2.4 Manage then save → title persists
- [ ] [ ] 2.5 Close after Manage → back to SessionDetail (not tab)
- [ ] [ ] 2.6 Close without Manage → back to tab (clean exit)
- [ ] [ ] 2.7 Device back without Manage → clean exit

### Flow 3 (pickup-continue)
- [ ] [ ] 3.1 Continue from banner → params correct
- [ ] [ ] 3.2 Save match → SessionDetail shown
- [ ] [ ] 3.3 Manage Session → navigation correct
- [ ] [ ] 3.4 Share → share sheet works
- [ ] [ ] 3.5 Close without saving → no orphan state

### Flow 4 (pickup-new)
- [ ] [ ] 4.1 Open new pickup → params correct (sessionId=null)
- [ ] [ ] 4.2 Save without Manage → session auto-created
- [ ] [ ] 4.3 Manage → session created
- [ ] [ ] 4.4 Manage then save → title persists
- [ ] [ ] 4.5 Close without Manage → back to tab (clean exit)
- [ ] [ ] 4.6 Device back without Manage → clean exit

### Cross-Flow Edge Cases
- [ ] [ ] E1 Add Another from SessionDetail → form cleared, same session
- [ ] [ ] E2 Empty draft session in banner → not filtered
- [ ] [ ] E3 Session sharing + collab → both users see same state

---

## E2E Test File Organization

### Suggested Structure
```
apps/mobile/__tests__/app/
├── (tabs)/
│   └── add-games.test.tsx          // Tests 1.1–4.6, E1–E4
└── (stack)/
    └── score-game.test.tsx          // Tests specific to score-game screen
```

### Test Helper Functions (to create in `__tests__/utils/test-helpers.ts`)
```typescript
// Flow setup helpers
createActiveLeagueSession()        // Setup for Flow 1
createActivePickupSession()        // Setup for Flow 3
seedLeagueWithMultiplePlayers()    // Setup for all flows

// Navigation helpers
navigateToAddGamesTab()
tapLeagueWithActiveSession(leagueId)
tapNewLeagueSession(leagueId)
tapContinuePickupSession()
tapNewPickupGame()

// Score-game interaction helpers
fillScoreEntry(homeTeam, awayTeam, homeScore, awayScore)
tapManageSession()
tapShareSession()
tapSaveGame()
tapCloseButton()
```

---

## Known Limitations & Deferred Tests

- **Offline support:** Not tested here; deferred to Phase 10 Polish
- **Form state persistence on app kill:** Accepted data loss (component state only)
- **Real-time updates:** Not covered here; see Phase 9 Real-Time Notifications
- **Voice/video integration:** Not applicable to Add Games flow
- **Analytics tracking:** Not covered; deferred to Phase 10 Polish
