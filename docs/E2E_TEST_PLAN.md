# E2E Test Plan

Current coverage: ~30% of user flows. This plan adds 8 epics to bring coverage to ~90%.

Each epic is self-contained and can be worked on independently. Epics are ordered by priority — earlier epics cover higher-risk gaps.

---

## Infrastructure Notes

**Existing fixtures** (in `tests/e2e/fixtures/test-fixtures.js`):
- `testUser` / `secondTestUser` — authenticated users with completed profiles
- `authedPage` — page with tokens injected, navigated to `/home`
- `leagueWithPlayers` — league + active season + 4 players
- `sessionWithMatches` — submitted session with 2 matches
- `leagueWithPlaceholder` — league + 3 real players + 1 placeholder + match

**Existing page objects** (in `tests/e2e/pages/`):
- `BasePage`, `AuthPage`, `HomePage`, `LeaguePage`, `SessionPage`, `InvitePage`

**New fixtures/page objects needed** are noted per-epic.

---

## Epic 1: Friends System

**Why first:** Brand new feature, zero coverage, high interaction surface.

**New fixtures needed:**
- `twoFriends` — two users who are already friends (for unfriend/mutual tests)

**New page object needed:**
- `FriendsPage` — helpers for the Friends tab on `/home`

### Spec: `friends/friend-requests.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Send friend request from player profile | `testUser`, `secondTestUser`, `authedPage` | Navigate to second user's public profile → click "Add Friend" | Button changes to "Request Sent", API returns 201 |
| 2 | Accept friend request | `testUser`, `secondTestUser`, authedPage for each | User A sends request via API → User B opens Friends tab → "Requests" section shows User A → click "Accept" | User A appears in friends list, request disappears |
| 3 | Decline friend request | Same as above | User A sends request → User B clicks "Decline" | Request disappears, users are not friends |
| 4 | Cancel outgoing request | `testUser`, `secondTestUser`, `authedPage` | User A sends request → User A opens Friends tab → finds pending request → clicks "Cancel" | Request removed from pending list |
| 5 | Cannot send duplicate request | `testUser`, `secondTestUser`, `authedPage` | Send request via API → navigate to profile → verify button shows "Request Sent" (not "Add Friend") | Button state reflects existing request |

### Spec: `friends/friend-list.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Friends list shows accepted friends | Two users made friends via API | Open Friends tab | Friend appears with name, avatar, level |
| 2 | Unfriend a friend | Two users made friends via API | Open Friends tab → click friend → click "Remove Friend" → confirm | Friend removed from list |
| 3 | Friend suggestions appear | `testUser` in a league with other players | Open Friends tab → check Suggestions section | Non-friend league members appear as suggestions |
| 4 | Mutual friends shown on profile | Three users: A↔B friends, A↔C friends | User B views User C's profile | "1 mutual friend" shown |

---

## Epic 2: Public Pages (Anonymous Visitor)

**Why second:** SEO-critical, first-impression pages, easy to test (no auth needed).

**New page objects needed:**
- `CourtDirectoryPage` — court listing, filters, map toggle
- `CourtDetailPage` — court detail, reviews section
- `PublicPlayerPage` — public player profile
- `PublicLeaguePage` — public league view

### Spec: `public/court-pages.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Court directory loads and shows courts | Seed court data (global-setup or fixture) | Navigate to `/courts` | Page loads, court cards visible, Navbar present |
| 2 | Court detail page renders | Seed court with reviews | Navigate to `/courts/{slug}` | Court name, location, rating, review list visible |
| 3 | Nearby courts section renders | Seed courts with coordinates | Navigate to `/courts/{slug}` | "Nearby Courts" section present |
| 4 | Court directory filter works | Seed courts in multiple locations | Use location filter on `/courts` | Filtered results update |

### Spec: `public/player-pages.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Public player profile renders | `leagueWithPlayers` (creates real players) | Navigate to `/player/{id}/{slug}` (unauthenticated) | Name, stats, Navbar visible |
| 2 | Profile redirects to canonical slug | Same | Navigate to `/player/{id}/wrong-slug` | URL updates to correct slug |
| 3 | Invalid player ID shows error | None | Navigate to `/player/99999/nobody` | 404 or error state shown |

### Spec: `public/league-pages.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Public league page renders for anon | `leagueWithPlayers` | Navigate to `/league/{id}` while logged out | League name, standings, Navbar visible |
| 2 | Find Leagues page renders | Seed leagues | Navigate to `/find-leagues` | League cards visible, filters available |
| 3 | Find Players page renders | Seed players | Navigate to `/find-players` | Player cards visible, filters available |

### Spec: `public/static-pages.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Privacy policy renders | None | Navigate to `/privacy-policy` | Content visible, Navbar present |
| 2 | Terms of service renders | None | Navigate to `/terms-of-service` | Content visible, Navbar present |
| 3 | Contribute page renders | None | Navigate to `/contribute` | Content visible, Navbar present |
| 4 | Location directory renders | None | Navigate to `/beach-volleyball` | Page loads, location cards visible |

---

## Epic 3: Profile & Onboarding

**Why third:** Every new user hits this flow. Currently relies on API helper to bypass it.

**New fixture needed:**
- `incompleteUser` — user created & verified but profile NOT completed (no `completeTestUserProfile` call)

### Spec: `profile/onboarding.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Profile completion modal shown for new user | `incompleteUser`, page with tokens injected | Navigate to `/home` | "Complete Your Profile" modal/prompt appears |
| 2 | Complete profile form | Same | Fill gender, level, city, state, location → submit | Modal disappears, Home tab content loads |
| 3 | Profile data persists after completion | Complete profile in previous step | Reload `/home` | No modal, profile tab shows saved data |

### Spec: `profile/edit-profile.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | View profile tab | `testUser`, `authedPage` | Click Profile tab on Home page | Profile fields visible with current values |
| 2 | Edit profile fields | Same | Change level → save | Success toast, value persists on reload |
| 3 | Upload avatar | Same | Upload image file via avatar input | Avatar preview updates |
| 4 | Delete avatar | User with avatar | Click remove avatar → confirm | Avatar reverts to default |

---

## Epic 4: Notifications

**Why fourth:** Ties into friends, leagues, and sessions. High engagement feature.

**New page object needed:**
- `NotificationHelpers` — bell count, open inbox, mark read

### Spec: `notifications/notification-inbox.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Notification bell shows unread count | Trigger notification (e.g., friend request via API) | Check Navbar notification bell | Badge shows count > 0 |
| 2 | Open notification inbox | Same | Click notification bell | Inbox panel opens, notification item visible |
| 3 | Click notification marks it as read | Same | Click a notification item | Unread count decrements, item style changes |
| 4 | Mark all as read | Multiple notifications via API | Click "Mark all as read" | All items marked read, badge disappears |
| 5 | Notification links navigate correctly | Friend request notification | Click the notification | Navigates to correct page (e.g., friends tab) |

### Spec: `notifications/notification-triggers.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Friend request creates notification | `testUser`, `secondTestUser` | User A sends friend request → User B checks notifications | Notification with User A's name appears |
| 2 | Friend accept creates notification | Same + send request | User B accepts → User A checks notifications | "accepted your friend request" notification |
| 3 | League join creates notification | `testUser` as league admin, `secondTestUser` | User B joins league → User A checks notifications | "joined your league" notification |

---

## Epic 5: Court Reviews & Submissions

**Why fifth:** Major feature, zero test coverage, user-generated content flow.

**New fixtures needed:**
- `testCourt` — court seeded via API/DB for review tests
- `courtWithReviews` — court + existing reviews

**New page object needed:**
- `CourtPage` — review form, submit court, suggest edit

### Spec: `courts/court-reviews.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Submit a court review | `testUser`, `authedPage`, `testCourt` | Navigate to court page → click "Write Review" → fill rating + text + tags → submit | Review appears in list, average rating updates |
| 2 | Edit own review | Same + existing review | Click edit on own review → change rating → save | Updated review visible |
| 3 | Delete own review | Same | Click delete → confirm | Review removed from list |
| 4 | Cannot review same court twice | User with existing review | Navigate to court → check review section | "Write Review" button hidden or shows "Edit Review" |

### Spec: `courts/court-submissions.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Submit a new court | `testUser`, `authedPage` | Navigate to courts → click "Add Court" → fill name, location, details → submit | Success message, court in pending state |
| 2 | Suggest edit to existing court | `testUser`, `authedPage`, `testCourt` | Navigate to court → click "Suggest Edit" → change description → submit | Success message |
| 3 | Submission form validates required fields | Same | Submit with empty name | Validation error shown |

---

## Epic 6: League Admin Flows

**Why sixth:** Core management functionality, currently all done via API helpers.

**New page objects needed:**
- `CreateLeagueModal` — league creation form
- `LeagueAdminPage` — extends LeaguePage with admin actions

### Spec: `league-admin/create-league.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Create a league via UI | `testUser`, `authedPage` | Home → click "Create League" → fill name, description → submit | Redirects to league page, user is admin |
| 2 | Create league validates required fields | Same | Submit empty form | Validation errors shown |

### Spec: `league-admin/manage-seasons.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Create a season via UI | `testUser`, `authedPage`, league created | League Details tab → click "Add Season" → fill name, dates → submit | Season appears in list, becomes active |
| 2 | Edit a season | Same + existing season | Click edit on season → change end date → save | Updated date shown |

### Spec: `league-admin/manage-members.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Add player to league | `testUser`, `authedPage`, league created | Details tab → "Add Players" → search player → add | Player appears in members list |
| 2 | Remove member from league | Same + member added | Click member → remove → confirm | Member removed from list |
| 3 | Change member role to admin | Same + member added | Click member → set as admin | Role badge updates |

### Spec: `league-admin/join-leave.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Player joins open league | `secondTestUser`, open league | Navigate to league → click "Join" | User added to members, button changes to "Leave" |
| 2 | Player leaves league | Same + joined | Click "Leave" → confirm | Removed from members |
| 3 | Request to join private league | `secondTestUser`, private league | Navigate to league → click "Request to Join" | "Request Pending" state shown |
| 4 | Admin approves join request | Admin user, pending request | Details tab → Join Requests → Approve | Player added to members |
| 5 | Admin rejects join request | Same | Details tab → Join Requests → Reject | Request removed |

---

## Epic 7: Schedules, Signups & League Messages

**Why seventh:** Deeper league management; depends on Epic 6 patterns.

### Spec: `league-admin/weekly-schedules.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Create weekly schedule | `testUser`, league + season | Details tab → "Add Schedule" → fill day, time, location → save | Schedule appears in list |
| 2 | Edit weekly schedule | Same + existing schedule | Click edit → change time → save | Updated time shown |
| 3 | Delete weekly schedule | Same | Click delete → confirm | Schedule removed |

### Spec: `league-admin/signups.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Create signup event | `testUser`, league + season | Sign Ups tab → "Create Signup" → fill details → save | Signup appears in list |
| 2 | Player signs up for event | `secondTestUser`, league member, open signup | Sign Ups tab → click "Sign Up" | Player shown in signup list, button changes to "Drop Out" |
| 3 | Player drops out | Same + signed up | Click "Drop Out" → confirm | Player removed from signup list |
| 4 | View signup player list | Admin, signup with players | Click signup → view players | Player names visible |

### Spec: `league/league-messages.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Post a message | `testUser`, league admin, `authedPage` | Messages tab → type message → send | Message appears in thread with author name |
| 2 | View existing messages | Same + seed messages via API | Open Messages tab | Messages visible in chronological order |

---

## Epic 8: Admin Moderation

**Why last:** Admin-only, lower traffic, but important for content quality.

**New fixture needed:**
- `adminUser` — user whose phone is in `system_admin_phone_numbers`

### Spec: `admin/court-moderation.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | View pending court submissions | `adminUser`, pending court submission | Navigate to admin panel → courts section | Pending court listed |
| 2 | Approve a court submission | Same | Click "Approve" | Court status changes, visible in public directory |
| 3 | Reject a court submission | `adminUser`, another pending court | Click "Reject" | Court removed from pending list |

### Spec: `admin/suggestion-moderation.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | View pending edit suggestions | `adminUser`, court with pending suggestion | Navigate to court or admin view | Suggestion visible |
| 2 | Apply a suggestion | Same | Review suggestion → click "Apply" | Court details updated with suggested values |

### Spec: `admin/admin-panel.spec.js`

| # | Test | Setup | Steps | Assertions |
|---|------|-------|-------|------------|
| 1 | Admin panel loads for system admin | `adminUser`, authed page | Navigate to `/admin-view` | Control panel visible |
| 2 | Non-admin cannot access admin panel | `testUser`, authed page | Navigate to `/admin-view` | Redirected or 403 |
| 3 | View user feedback | `adminUser`, feedback seeded | Open feedback section | Feedback entries visible |

---

## Summary

| Epic | Spec Files | Tests | New Fixtures | New Page Objects |
|------|-----------|-------|-------------|-----------------|
| 1. Friends | 2 | 9 | `twoFriends` | `FriendsPage` |
| 2. Public Pages | 4 | 11 | court seed data | `CourtDirectoryPage`, `CourtDetailPage`, `PublicPlayerPage`, `PublicLeaguePage` |
| 3. Profile & Onboarding | 2 | 7 | `incompleteUser` | — |
| 4. Notifications | 2 | 8 | — | `NotificationHelpers` |
| 5. Court Reviews & Submissions | 2 | 7 | `testCourt`, `courtWithReviews` | `CourtPage` |
| 6. League Admin | 4 | 12 | — | `CreateLeagueModal`, `LeagueAdminPage` |
| 7. Schedules, Signups & Messages | 3 | 9 | — | — |
| 8. Admin Moderation | 3 | 8 | `adminUser` | — |
| **Total** | **22** | **71** | | |

Combined with existing **18 spec files / ~43 tests**, this brings us to **40 spec files / ~114 tests** covering all major user flows.
