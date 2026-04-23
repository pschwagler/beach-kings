# Wave 5 — Visual Audit Report

**Date:** 2026-04-19  
**Auditor:** Claude (agent-device --session qa, iOS Simulator UDID 4764F0A1-58AE-42A2-ADC4-457EAA0594B0)  
**App:** Beach League (`com.beachleague.app`), Expo SDK 54 / expo-router  
**Methodology:** Live app screenshots via agent-device + wireframe renders at 402×874 (iPhone 16e) via Chrome DevTools MCP. Routes unreachable due to Metro being unavailable at audit time were assessed via static source code analysis.

---

## Summary

| Category | Count | Resolved | Open |
|---|---|---|---|
| Blockers (prevents use or navigation) | 10 | 10 | 0 |
| Polish (visual/UX gaps vs wireframe) | 14 | 6 | 8 |
| Wireframe-delta-ok (intentional deviations) | 28 | — | — |
| Skipped (Metro unavailable, blocked by parent crash) | 5 | — | — |

**Audit coverage:** 35 routes assessed (25 via live screenshots, 5 via static code analysis, 5 skipped).

**Resolution status updated:** 2026-04-19 — see [Resolution Log](#resolution-log) at the bottom of this file.

---

## Blockers

These issues make a screen unusable, prevent navigation, or represent a production crash.

### B-01 — Courts screen: runtime crash (CRITICAL)

**Route:** `(stack)/courts`  
**Screenshot:** `docs/wave5/screenshots/courts-error.png`  
**Wireframe:** `docs/wave5/screenshots/courts-wireframe.png`

The Courts list screen crashes immediately on mount with:
```
Render Error: allCourts.filter is not a function (it is undefined)
useCourtsScreen.ts line 54
```

**Root cause:** `api.getCourts({})` in `packages/api-client/src/methods.ts` line 492 calls `/api/public/courts`, but the backend has no such endpoint — only `/api/courts` (authenticated) and specific sub-routes under `/api/public/courts/{slug}/...`. The 404 response body (`{"detail":"Not Found"}`) is a truthy non-null object, so `data ?? []` returns the error object instead of `[]`, and `.filter()` fails on a plain object.

**Fix:** Change the endpoint path in `methods.ts` from `/api/public/courts` to `/api/courts`, OR add a defensive `Array.isArray(data) ? data : []` guard in `useCourtsScreen.ts` line 51.

---

### B-02 — Notifications screen: missing TopNav (no back button, no title)

**Route:** `(stack)/notifications`  
**Screenshot:** `docs/wave5/screenshots/notifications.png`  
**Wireframe:** `docs/wave5/screenshots/notifications-wireframe.png`

`NotificationsScreen` has no `TopNav` component. The filter tab bar (All / Friends / Games / Leagues) bleeds into the status bar area. There is no back button and no "Notifications" title. Users cannot navigate back except via iOS swipe-back gesture.

**Affected file:** `src/components/screens/Notifications/NotificationsScreen.tsx`

---

### B-03 — Messages inbox screen: missing TopNav (no back button, no title, no compose)

**Route:** `(stack)/messages`  
**Screenshot:** `docs/wave5/screenshots/messages.png`  
**Wireframe:** `docs/wave5/screenshots/messages-wireframe.png`

`MessagesScreen` has no `TopNav`. The search bar bleeds into the status bar with no title, no back button, and no compose/new-message button. Users cannot navigate back except via iOS swipe-back.

**Wireframe shows:** "Messages" title + back button + compose icon in a proper TopNav.

**Affected file:** `src/components/screens/Messages/MessagesScreen.tsx`

---

### B-04 — Message thread screen: missing TopNav (no back button, no player name)

**Route:** `(stack)/messages/[playerId]`  
**Wireframe:** `docs/wave5/screenshots/message-thread-wireframe.png`

`MessageThreadScreen` renders no header at all — no back button, no player name/avatar in a title bar. The `playerName` prop is received but immediately aliased as `_playerName` (unused). The wireframe shows a TopNav with the recipient's name, avatar, and back button.

**Affected file:** `src/components/screens/Messages/MessageThreadScreen.tsx`

---

### B-05 — Find Players screen: missing TopNav (no back button, no title)

**Route:** `(stack)/find-players`  
**Screenshot:** `docs/wave5/screenshots/find-players.png`  
**Wireframe:** `docs/wave5/screenshots/find-players-wireframe.png`

`FindPlayersScreen` has no `TopNav`. The Players/Friends tab bar and search input bleed to the top of the screen with no back navigation.

**Affected file:** `src/components/screens/FindPlayers/FindPlayersScreen.tsx`

---

### B-06 — Pending Invites screen: missing TopNav (no back button, no title)

**Route:** `(stack)/pending-invites`  
**Wireframe:** `docs/wave5/screenshots/pending-invites-wireframe.png`

`PendingInvitesScreen` has no `TopNav`, no title, and no back button. Content renders with no navigation chrome.

**Affected file:** `src/components/screens/Leagues/PendingInvitesScreen.tsx`

---

### B-07 — League detail (dashboard): missing TopNav (no back button, no league name)

**Route:** `(stack)/league/[id]`  
**Screenshot:** `docs/wave5/screenshots/league-detail.png`  
**Wireframe:** `docs/wave5/screenshots/league-detail-wireframe.png`

`LeagueDetailScreen` has no `TopNav`. The segmented tab bar (Dashboard / Matches / Signups / Info / Stats) starts at the top of the screen with no league name header and no back button.

**Affected file:** `src/components/screens/Leagues/LeagueDetailScreen.tsx`

---

### B-08 — Create League screen: missing TopNav (no back button, no title)

**Route:** `(stack)/create-league`  
**Screenshot:** `docs/wave5/screenshots/create-league.png`  
**Wireframe:** `docs/wave5/screenshots/create-league-wireframe.png`

`CreateLeagueScreen` has no `TopNav`. The form begins at the very top of the screen with no "Create League" title and no way to dismiss/cancel except tapping outside or iOS swipe-back.

**Affected file:** `src/components/screens/Leagues/CreateLeagueScreen.tsx`

---

### B-09 — Find Leagues screen: missing TopNav (no back button, no title)

**Route:** `(stack)/find-leagues`  
**Screenshot:** `docs/wave5/screenshots/find-leagues.png`  
**Wireframe:** `docs/wave5/screenshots/find-leagues-wireframe.png`

`FindLeaguesScreen` has no `TopNav`. Search filters and league cards render with no navigation bar.

**Affected file:** `src/components/screens/Leagues/FindLeaguesScreen.tsx`

---

### B-10 — League Invite screen: missing TopNav (no back button, no title)

**Route:** `(stack)/league/[id]/invite`  
**Wireframe:** `docs/wave5/screenshots/league-invite-wireframe.png`

`LeagueInviteScreen` has no `TopNav`. Source analysis confirms zero `TopNav` references in the file.

**Affected file:** `src/components/screens/Leagues/LeagueInviteScreen.tsx`

---

## Polish

These issues are functional but represent visual or UX gaps compared to the wireframe.

### P-01 — Profile tab: menu section unreachable via scroll

**Route:** `(tabs)/profile`  
**Screenshots:** `docs/wave5/screenshots/profile-menu.png`, `profile-menu2.png`, `profile-menu3.png`

The Profile tab shows the player stats and form fields but the Activity section (My Stats, My Games, Friends) and Account section (Settings, Log Out) in `ProfileMenuSection` could not be reached via scroll during audit. The `ScrollView` appears not to respond to agent-device scroll commands. Human-verified scroll is recommended.

---

### P-02 — Session detail: "Add Games" FAB label vs wireframe

**Route:** `(stack)/session/[id]`  
**Screenshots:** `docs/wave5/screenshots/session-detail.png`  
**Wireframe:** `docs/wave5/screenshots/session-detail-wireframe.png`

The wireframe shows a floating action button labeled "Score Game" / `btn-score`. The implementation shows an "Add Games" label. This is an intentional naming choice (the rename from "match" to "game") but differs from wireframe copy.

---

### P-03 — Session create: date/time picker is native, not custom

**Route:** `(stack)/session/create`  
**Screenshot:** `docs/wave5/screenshots/session-create.png`  
**Wireframe:** `docs/wave5/screenshots/session-create-wireframe.png`

Wireframe shows a custom styled date-time picker. Implementation uses the native iOS date picker. Functional but visually different.

---

### P-04 — Home: no skeleton loading for session cards

**Route:** `(tabs)/home`  
**Screenshot:** `docs/wave5/screenshots/home.png`  
**Wireframe:** `docs/wave5/screenshots/home-wireframe.png`

Wireframe shows session cards with skeleton loading states. App shows plain activity indicators during load. LoadingSkeleton component exists elsewhere in the codebase.

---

### P-05 — Add Games: league select list shows no empty state messaging

**Route:** `(tabs)/add-games`  
**Screenshot:** `docs/wave5/screenshots/add-games.png`  
**Wireframe:** `docs/wave5/screenshots/add-games-wireframe.png`

When no active leagues are available, the wireframe shows a "No leagues found" empty state with an illustration. The implementation shows a plain empty view.

---

### P-06 — Social tab: no friends tab shortcut on initial view

**Route:** `(tabs)/social`  
**Screenshot:** `docs/wave5/screenshots/social.png`  
**Wireframe:** `docs/wave5/screenshots/social-wireframe.png`

`FriendsShortcut` component exists in `SocialScreen` but the wireframe positions it more prominently at the top. Layout is close but the shortcut card is below the conversation list rather than above it.

---

### P-07 — Settings: no account deletion option

**Route:** `(stack)/settings`  
**Screenshot:** `docs/wave5/screenshots/settings.png`  
**Wireframe:** `docs/wave5/screenshots/settings-wireframe.png`

Wireframe shows a "Delete Account" danger zone in the Settings screen. Implementation has Change Password, Notifications, and Log Out, but no account deletion.

---

### P-08 — Settings account: phone number field missing

**Route:** `(stack)/settings/account`  
**Screenshot:** `docs/wave5/screenshots/settings-account.png`  
**Wireframe:** `docs/wave5/screenshots/settings-account-wireframe.png`

Wireframe includes a Phone Number field in account settings. Implementation has First Name, Last Name, Email, City, State, and Level — no phone number.

---

### P-09 — Notifications: no "Mark all read" button visible at top

**Route:** `(stack)/notifications`  
**Screenshot:** `docs/wave5/screenshots/notifications.png`

While `NotificationsScreen` code has a "Mark all read" button conditional on unread count, the wireframe shows it prominently in the header area. The missing TopNav means this button is instead rendered below the filter tabs, not aligned with wireframe.

---

### P-10 — League chat: no message composer visible at bottom

**Route:** `(stack)/league/[id]` (chat tab)  
**Screenshot:** `docs/wave5/screenshots/league-chat.png`  
**Wireframe:** `docs/wave5/screenshots/league-chat-wireframe.png`

`LeagueChatTab` screen does not show a message compose bar. Wireframe shows an input area at the bottom with send button. Chat appears read-only in implementation.

---

### P-11 — Session roster: player avatar initials are plain circles (no color variation)

**Route:** `(stack)/session/[id]/roster`  
**Screenshot:** `docs/wave5/screenshots/session-roster.png`  
**Wireframe:** `docs/wave5/screenshots/session-roster-wireframe.png`

Wireframe shows avatar circles with color variation by player. Implementation uses a uniform teal/brand color for all initials.

---

### P-12 — Session edit: photo upload section not present

**Route:** `(stack)/session/[id]/edit`  
**Screenshot:** `docs/wave5/screenshots/session-edit.png`  
**Wireframe:** `docs/wave5/screenshots/session-edit-wireframe.png`

Wireframe shows a photo/banner upload section for the session. Implementation has location, date, max players, and notes, but no photo upload.

---

### P-13 — Courts crash message: misleading error state

**Route:** `(stack)/courts`  
**Screenshot:** `docs/wave5/screenshots/courts-error.png`

When the Courts screen crashes, the Expo dev overlay shows a raw error stack trace rather than a user-friendly `CourtsErrorState` component. The `CourtsErrorState` component exists but is never reached because the crash is in the hook's render path before the screen's conditional rendering. In production this would be a blank white screen.

---

### P-14 — Courts API response: missing fields used by filter logic

**Route:** `(stack)/courts` (blocked by B-01, assessed via code)

Even after fixing B-01, the backend's `/api/courts` response only includes `id`, `name`, `address`, `location_id`, `geoJson`, `created_at`, `updated_at`. The filter logic in `useCourtsScreen.ts` references `court.surface_type`, `court.has_lights`, `court.average_rating`, and `court.city` — none of which are in the response. All filter chips except search will silently pass everything through or produce no results.

---

## Wireframe-delta-ok

These are intentional implementation deviations from the wireframe, documented as acceptable.

| ID | Route | Wireframe Element | Implementation | Reason |
|---|---|---|---|---|
| D-01 | my-games | `filter-select` league dropdown | Chip filter (clear-only) | API doesn't yet support per-league game history |
| D-02 | my-games | `state-switcher` all/league toggle | Not implemented | Deferred |
| D-03 | my-stats | `filter-chip` league filter | Not implemented | Backend filter support deferred |
| D-04 | my-stats | `chart-tooltip` on tap | Not shown | RN gesture cost; deferred as polish |
| D-05 | my-stats | `show-all` below breakdown table | Not implemented | All rows shown; pagination deferred |
| D-06 | score-game | `score-league.html` league-select step | Not implemented | Score entry is standalone for MVP |
| D-07 | score-game | `session-bar` at top | Not implemented | Session concept not yet in backend |
| D-08 | score-game | `modal-overlay` discard confirmation | Not implemented | Deferred polish |
| D-09 | score-game | `board-player` remove button | Not implemented | Tap same slot to reassign |
| D-10 | session-create | Custom date-time picker | Native iOS picker | Acceptable MVP tradeoff |
| D-11 | session-detail | "Score Game" FAB label | "Add Games" | Follows game rename convention |
| D-12 | session-detail | Session timer widget | Not shown | Timer is session-active concern, not detail |
| D-13 | session-roster | Color-varied avatars | Uniform brand color | Sufficient for MVP identification |
| D-14 | session-edit | Photo upload section | Not implemented | Backend image upload deferred |
| D-15 | home | Session card skeletons | Activity indicator | Skeleton already used in other tabs; home deferred |
| D-16 | home | "Upcoming" / "Past" tab toggle | Single chronological list | Simpler for MVP; filter deferred |
| D-17 | leagues | Segmented All/Active/Past filter | Not shown | One-tap league list is sufficient for MVP |
| D-18 | add-games | Empty state illustration | Plain empty view | Illustration assets not yet in asset pipeline |
| D-19 | social | Friends shortcut position | Below conversation list | Compound layout; functional equivalent |
| D-20 | settings | App version shown at bottom | Not visible | Non-critical |
| D-21 | settings | Dark mode toggle | Not implemented in Settings | Toggle deferred; system theme respected |
| D-22 | notifications | Grouped by date | Flat list | Grouping logic deferred |
| D-23 | profile | Activity stats bar (games, rating) | Present via `StatsBar` | Matches wireframe — OK |
| D-24 | find-players | Tab bar Players/Friends | Implemented | Matches wireframe — OK |
| D-25 | league-detail | Tab bar Dashboard/Matches/Signups/Info/Stats | Implemented | Matches wireframe — OK |
| D-26 | create-league | Multi-step wizard | Single-page form | Simpler for MVP; wizard is polish |
| D-27 | courts | Map pinned at top, list below | Correct structure | Crash prevents verification but `CourtsScreen` code matches |
| D-28 | session-menu | Bottom sheet action menu | Implemented via `SessionBottomSheet` | Matches wireframe — OK |

---

## Skipped

These routes could not be audited with live app screenshots due to Metro bundler unavailability at resumption time, and the parent screen crash (B-01) blocking child routes.

| Route | Reason |
|---|---|
| `(stack)/court/[id]` | Courts list crashes (B-01); court detail unreachable |
| `(stack)/court/[id]/photos` | Courts list crashes (B-01); photos unreachable |
| `(stack)/kob/[code]` | No KoB game in test fixture; Metro down at audit time |
| `(stack)/tournament/[id]` | No tournament in test fixture; Metro down at audit time |
| `(stack)/tournaments` | Metro down at audit time |

**Static analysis note on skipped routes:** All five skipped screens have `TopNav` present in their source code (`KobScreen`, `TournamentsListScreen`, `TournamentDetailScreen`, `CourtDetailScreen`, `CourtPhotosScreen`). Assuming correct TopNav behavior, none are expected to exhibit the nav-chrome blocker pattern found in B-02 through B-10.

---

## Screenshots Index

All screenshots are in `docs/wave5/screenshots/`:

| File | Description |
|---|---|
| `home.png` / `home-wireframe.png` | Home tab |
| `leagues.png` / `leagues-wireframe.png` | Leagues tab |
| `add-games.png` / `add-games-wireframe.png` | Add Games tab |
| `social.png` / `social-wireframe.png` | Social tab |
| `profile.png` / `profile-wireframe.png` | Profile tab |
| `profile-menu.png`, `profile-menu2.png`, `profile-menu3.png` | Profile scroll attempts |
| `session-create.png` / `session-create-wireframe.png` | Session create |
| `session-detail.png` / `session-detail-wireframe.png` | Session detail |
| `session-detail-scroll.png` | Session detail scrolled |
| `session-edit.png` / `session-edit-wireframe.png` | Session edit |
| `session-roster.png` / `session-roster-wireframe.png` | Session roster |
| `session-menu.png` / `session-menu-wireframe.png` | Session bottom sheet |
| `league-detail.png` / `league-detail-wireframe.png` | League detail tabs |
| `league-chat.png` / `league-chat-wireframe.png` | League chat |
| `create-league.png` / `create-league-wireframe.png` | Create league |
| `find-leagues.png` / `find-leagues-wireframe.png` | Find leagues |
| `notifications.png` / `notifications-wireframe.png` | Notifications |
| `messages.png` / `messages-wireframe.png` | Messages inbox |
| `find-players.png` / `find-players-wireframe.png` | Find players |
| `settings.png` / `settings-wireframe.png` | Settings |
| `settings-account.png` / `settings-account-wireframe.png` | Account settings |
| `settings-notifications.png` / `settings-notifications-wireframe.png` | Notification settings |
| `change-password.png` / `change-password-wireframe.png` | Change password |
| `courts-error.png` / `courts-wireframe.png` | Courts (crash) |
| `welcome.png` / `welcome-wireframe.png` | Welcome |
| `onboarding.png` / `onboarding-wireframe.png` | Onboarding |
| `login.png` / `login-wireframe.png` | Login |
| `signup.png` / `signup-wireframe.png` | Sign up |
| `verify.png` / `verify-wireframe.png` | OTP verify |
| `my-games-wireframe.png` | My games (wireframe only) |
| `my-stats-wireframe.png` | My stats (wireframe only) |
| `court-detail-wireframe.png` | Court detail (wireframe only) |
| `court-photos-wireframe.png` | Court photos (wireframe only) |
| `kob-live-wireframe.png` | KoB live (wireframe only) |
| `kob-schedule-wireframe.png` | KoB schedule (wireframe only) |
| `kob-standings-wireframe.png` | KoB standings (wireframe only) |
| `tournaments-wireframe.png` | Tournaments (wireframe only) |
| `tournament-detail-wireframe.png` | Tournament detail (wireframe only) |
| `message-thread-wireframe.png` | Message thread (wireframe only) |
| `player-profile-wireframe.png` | Player profile (wireframe only) |
| `pending-invites-wireframe.png` | Pending invites (wireframe only) |
| `score-league-wireframe.png` | Score league (wireframe only) |
| `score-scoreboard-wireframe.png` | Score scoreboard (wireframe only) |
| `league-invite-wireframe.png` | League invite (wireframe only) |
| `friends-wireframe.png` | Friends (wireframe only) |

---

## Resolution Log

Post-audit tracking. All status changes as of 2026-04-19.

### Blockers — all resolved

| ID | Status | Fix location |
|---|---|---|
| B-01 | ✅ Resolved | Endpoint switched to `/api/courts` in `packages/api-client/src/methods.ts`; `Array.isArray` guard added in `useCourtsScreen.ts`; backend `list_courts` moved to `court_service.list_courts` returning `CourtListItem[]`. Also closes P-13, P-14. |
| B-02 | ✅ Resolved | `NotificationsScreen.tsx` — wrapped in `SafeAreaView` + `TopNav title="Notifications"` with `rightAction` "Mark all read" when `unreadCount > 0`. Also closes P-09. |
| B-03 | ✅ Resolved | `MessagesScreen.tsx` — TopNav "Messages" with compose icon rightAction. |
| B-04 | ✅ Resolved | `MessageThreadScreen.tsx` — TopNav bound to fetched `playerName` with "Chat" fallback; route passes `playerName` via query param. |
| B-05 | ✅ Resolved | `FindPlayersScreen.tsx` — TopNav "Find Players" showBack. |
| B-06 | ✅ Resolved | `PendingInvitesScreen.tsx` — all three states (loading/error/list) wrapped in SafeAreaView + TopNav "Pending Invites". |
| B-07 | ✅ Resolved | `LeagueDetailScreen.tsx` — TopNav with dynamic `detail.name` title and "+ Add Game" rightAction for admin/member. LeagueHeader retained below (dual-header by design). |
| B-08 | ✅ Resolved | `CreateLeagueScreen.tsx` — TopNav "Create League" with Cancel leftAction + Create rightAction mirroring submit state. |
| B-09 | ✅ Resolved | `FindLeaguesScreen.tsx` — TopNav "Find Leagues" showBack. |
| B-10 | ✅ Resolved | `LeagueInviteScreen.tsx` — TopNav "Invite Players" showBack; KeyboardAvoidingView nested below. |

### Polish — status

| ID | Status | Notes |
|---|---|---|
| P-01 | ⚠ Needs human verify | Tool limitation — agent-device scroll did not reach Profile menu section. Source confirms `ProfileMenuSection` is present. No code change. |
| P-04 | ⏳ Needs re-verify | Screenshot was empty-state; skeleton not exercised. Re-capture with populated home to confirm. `LoadingSkeleton` exists in codebase. Leave open. |
| P-06 | 🚧 Blocked on Option B | Re-reviewed against wireframe: Social wireframe uses 4 sub-tabs (Messages/Notifications/Friends/Find Players) under a shared "Social" header. Current impl uses 2-tab segmented control. User decision: **Option A now** (ship per-screen TopNav via B-02/B-03/B-05), **Option B later** (4-sub-tab restructure). Tracked as follow-up. |
| P-07 | ✅ Resolved | Delete Account row present in Danger Zone — confirmed in `SettingsScreen.tsx` (screenshot match). |
| P-08 | 🚧 Blocked on backend | Backend has no change-phone flow while authenticated: `PUT /api/users/me` docstring explicitly says "Phone number cannot be changed" (`apps/backend/api/routes/users.py:29`). Existing `/api/auth/verify-phone` and `/api/auth/reset-phone/*` are signup/reset flows, not change-phone. Implementing P-08 requires a new backend endpoint pair (request-change-phone OTP + verify+update) with rate limiting. Tracked as follow-up. |
| P-09 | ✅ Resolved | Rolled into B-02 fix — "Mark all read" now rendered in TopNav rightAction. |
| P-10 | ✅ Resolved | `ChatInputBar` rendered in `LeagueChatTab.tsx`. |
| P-11 | ✅ Resolved | Avatar palette via `player.id % AVATAR_COLORS.length` in `SessionPlayerChip.tsx` / `SessionRosterRow.tsx`. |
| P-13 | ✅ Resolved | Rolled into B-01 fix — courts crash eliminated; `CourtsErrorState` reachable. |
| P-14 | ✅ Resolved | Rolled into B-01 fix — backend returns `CourtListItem[]` with `surface_type`, `has_lights`, `average_rating`. |
| P-02, P-03, P-05, P-12 | 📌 Wireframe-delta-ok | Documented as intentional deferrals (see D-11, D-10, D-18, D-14). No code change. |

### Follow-ups

1. **Option B — Social 4-sub-tab restructure** (P-06): move Notifications / Messages / FindPlayers content into `SocialScreen.tsx` as sub-tab panels under a shared "Social" TopNav. Standalone `/notifications`, `/messages`, `/find-players` routes remain for deep-linking. Estimated 2–3 days.
2. **Change-phone backend + UI** (P-08): new endpoint pair `POST /api/auth/change-phone/request` + `POST /api/auth/change-phone/verify` (OTP, rate-limited). Mobile route `(stack)/settings/phone` with E.164 input → OTP verify → success refetch.
3. **Populated-home re-capture** (P-04): seed session data and re-screenshot `(tabs)/home` against `home-wireframe.png`; close P-04 on match or refile specific skeleton gaps.

---

## Priority Action Items

1. **B-01 (CRITICAL):** Fix courts endpoint path in `packages/api-client/src/methods.ts` — change `/api/public/courts` to `/api/courts`. Add `Array.isArray()` guard in `useCourtsScreen.ts` line 51 as defense.
2. **B-02–B-10 (HIGH, pattern fix):** Add `<TopNav title="..." showBack />` to the 9 screens missing navigation chrome. This is a copy-paste fix. Affected screens: `NotificationsScreen`, `MessagesScreen`, `MessageThreadScreen` (also needs `playerName` wired to title), `FindPlayersScreen`, `PendingInvitesScreen`, `LeagueDetailScreen`, `CreateLeagueScreen`, `FindLeaguesScreen`, `LeagueInviteScreen`.
3. **P-14 (MEDIUM):** Align backend courts API response to include fields expected by the mobile filter logic (`surface_type`, `has_lights`, `average_rating`, `city`).
4. **P-10 (MEDIUM):** Add message compose bar to `LeagueChatTab` or mark it explicitly as read-only.
5. **P-07 (LOW):** Add account deletion option to Settings, or add a TODO comment tracking it.
