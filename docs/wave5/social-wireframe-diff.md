# Social & Messaging — Wireframe Implementation Diff

Wave 5 domain: Social & Messaging  
Branch: feat/ps/mobile-app-creation  
Date: 2026-04-19

---

## Routes implemented

| Route | File | Was | Now |
|-------|------|-----|-----|
| `/(stack)/messages` | `app/(stack)/messages/index.tsx` | `<ComingSoon/>` | `<MessagesScreen/>` |
| `/(stack)/messages/[playerId]` | `app/(stack)/messages/[playerId].tsx` | `<ComingSoon/>` | `<MessageThreadScreen/>` |
| `/(stack)/find-players` | `app/(stack)/find-players.tsx` | `<ComingSoon/>` | `<FindPlayersScreen/>` |
| `/(stack)/notifications` | `app/(stack)/notifications.tsx` | `<ComingSoon/>` | `<NotificationsScreen/>` |

---

## Screen components created

### Messages inbox (`src/components/screens/Messages/`)

Wireframe ref: `mobile-audit/wireframes/messages.html`

**Implemented:**
- Conversation list with unread-highlighted rows (`.convo-item.unread` → yellow `bg-[#fdf8ed]` background, bold name)
- Unread dot badge per row (`convo-unread-dot-{id}`)
- Search bar filtering conversations by name client-side
- Skeleton with 5 placeholder rows while loading
- Error state with retry
- Empty state with "No Messages Yet" copy
- Pull-to-refresh via `RefreshControl`
- `hapticLight()` on row tap, navigates to `routes.messages(playerId)`

**Wireframe deviations (intentional):**
- Social subnav tabs from wireframe (`messages.html` tab bar) omitted — navigation is handled by the Expo tab bar and TopNav back button pattern used across the app
- Avatar images not rendered (no avatar URL loading in MVP) — replaced with initials circle

---

### Message thread (`src/components/screens/Messages/MessageThreadScreen.tsx`)

Wireframe ref: `mobile-audit/wireframes/message-thread.html`

**Implemented:**
- Sent bubbles (dark `#1a3a4a` bg) and received bubbles (white bg with shadow)
- Date dividers injected between messages that fall on different days (Today / Yesterday / date label)
- `KeyboardAvoidingView` with `behavior="padding"` on iOS, `"height"` on Android
- `keyboardVerticalOffset={88}` to account for TopNav height
- TextInput with `multiline`, `returnKeyType="send"`, `onSubmitEditing`, `autoComplete="off"`, `textContentType="none"`
- Send button disabled when input is empty
- `ActivityIndicator` in send button while sending
- Send error banner below input bar
- Empty thread state ("No messages yet. Say hello!")
- `hapticMedium()` on send, `hapticError()` on send failure

**Wireframe deviations:**
- Typing indicator dots omitted — requires WebSocket/presence system not in scope for this wave
- Avatar in thread header omitted — playerName prop is passed but name is displayed via TopNav title in the route
- No read receipts shown — `is_read` field is available but visual read receipts not in wireframe spec

---

### Find Players (`src/components/screens/FindPlayers/`)

Wireframe refs: `mobile-audit/wireframes/find-players.html`, `mobile-audit/wireframes/friends.html`

**Implemented:**
- Two-tab layout: **Players** (discover) / **Friends** (manage)
- Search bar filtering by name and city (client-side)
- Player rows with level badge (teal), mutual friends badge (gray), city, games count, last active label
- Add / Pending / Friends state buttons per row
- Optimistic pending state: `isPendingSend` set immediately on Add press, rolled back on API failure
- `hapticMedium()` on Add (primary CTA), `hapticLight()` on row tap
- Friends tab: friend request cards with Accept / Decline (optimistic removal)
- Friends tab: friend rows navigating to player profile
- Skeleton (5 rows) while loading
- Error state with retry on each tab independently
- Empty states per tab
- `api.discoverPlayers()`, `api.getFriends()`, `api.getFriendRequests('received')` called

**Wireframe deviations:**
- Filter chips (Nearby / Same League / Open / AA / A / B) from find-players wireframe omitted — the backend `discoverPlayers()` endpoint does not currently accept filter params; chips would have no effect. Can be added when backend supports filtering.
- Friend suggestions section from friends.html omitted — no `getPlayerSuggestions()` API endpoint exists yet

---

### Notifications (`src/components/screens/Notifications/`)

Wireframe ref: `mobile-audit/wireframes/notifications.html`

**Implemented:**
- Filter tabs: **All** / **Friends** / **Games** / **Leagues** (client-side filter over loaded data)
- Unread count badge on the All tab (shows 9+ when > 9 unread)
- "Mark all as read" button visible when unread count > 0
- Per-notification unread dot (`unread-dot-{id}`)
- Unread rows highlighted with yellow background (`bg-[#fdf8ed]`)
- Type-specific colored icons:
  - Friends (friend_request, friend_accepted, direct_message) → teal icon
  - Leagues (league_*, season_*, member_*) → gold/yellow icon  
  - Games (session_*, placeholder_claimed) → green icon
  - Default (bell) → gray icon
- **Friend request notifications** render inline Accept / Decline buttons when `is_read=false`
- Pressing Accept/Decline calls `api.acceptFriendRequest(requestId)` / `api.declineFriendRequest(requestId)` with optimistic mark-read
- Pressing any notification calls `api.markNotificationRead(id)` (optimistic) and navigates to `link_url` if present
- Skeleton (6 rows) while loading
- Error state with retry
- Empty state per filter

**Wireframe deviations:**
- Social subnav from notifications.html omitted (same reason as Messages — app-level navigation handles this)
- Notification grouping by date not implemented — list is flat, ordered by `created_at` desc as returned by API. Can be added as enhancement.

---

## API methods used

All methods were pre-existing in `packages/api-client/src/methods.ts`. No new mock API methods required.

| Method | Used in |
|--------|---------|
| `getConversations()` | useMessagesScreen |
| `getThread(playerId)` | useMessageThreadScreen |
| `sendDirectMessage(playerId, text)` | useMessageThreadScreen |
| `markThreadRead(playerId)` | available but not called in this wave |
| `getNotifications()` | useNotificationsScreen |
| `markNotificationRead(id)` | useNotificationsScreen |
| `markAllNotificationsRead()` | useNotificationsScreen |
| `discoverPlayers()` | useFindPlayersScreen |
| `getFriends()` | useFindPlayersScreen |
| `getFriendRequests('received')` | useFindPlayersScreen |
| `sendFriendRequest(playerId)` | useFindPlayersScreen |
| `acceptFriendRequest(requestId)` | useFindPlayersScreen, useNotificationsScreen |
| `declineFriendRequest(requestId)` | useFindPlayersScreen, useNotificationsScreen |

---

## Test summary

| Test file | Tests |
|-----------|-------|
| `__tests__/app/stack/messages/index.test.tsx` | 13 |
| `__tests__/app/stack/messages/thread.test.tsx` | 12 |
| `__tests__/app/stack/find-players.test.tsx` | 19 |
| `__tests__/app/stack/notifications.test.tsx` | 22 |
| **Total new** | **66** |

Full suite: 953 passing, 0 failing (baseline was 887).
