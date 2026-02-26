# Feature: Direct Messaging

**Date:** 2026-02-25
**Status:** Draft
**GitHub Issue:** #21

## Problem Statement

Players have no way to communicate privately within the app. They must exchange phone numbers or use external apps (iMessage, WhatsApp) to coordinate — which creates friction, especially for newer friendships formed through leagues. DMs keep conversations in-context alongside player profiles and game history.

## Success Criteria

- Friends can send and receive 1:1 text messages in real time
- Messages tab in HomeMenuBar shows conversation list with unread indicators
- Tapping a conversation opens a threaded chat view with message bubbles
- Unread message count badge visible on Messages tab (desktop sidebar + mobile bottom bar)
- New DM triggers a notification in the bell (existing notification system)
- "Message" shortcut button on friend cards and public player profiles (when friends)
- Unfriending preserves message history as read-only; re-friending restores send ability

## Scope

### In Scope
- 1:1 text-only messaging between mutual friends
- Conversation list view (sorted by most recent message)
- Thread view with message bubbles (sender/receiver styling)
- Real-time delivery via existing WebSocket infrastructure
- Unread count badge on Messages tab
- Bell notification for new DMs (uses existing notification system)
- "Message" button on friend cards (FriendsTab) and public player pages
- Empty state with CTA to Friends tab
- Unfriend → thread becomes read-only; re-friend → thread unlocked
- 500-character message limit

### Out of Scope
- Group chats / multi-person conversations
- Read receipts / "seen" indicators
- Media / image / file sharing
- Message editing or deletion
- Typing indicators
- Message search
- Block/mute functionality (can be added later)
- Push notifications (mobile native — not applicable until iOS app)

## User Flow

1. User navigates to **Messages** tab in HomeMenuBar (between Friends and Notifications in desktop sidebar; in "More" menu on mobile)
2. **Conversation list** loads — each row shows: friend's avatar, name, last message preview (truncated), timestamp, and unread dot if applicable
3. User taps a conversation → **Thread view** opens with:
   - Friend's name + avatar in header, back button
   - Chronological message bubbles (own messages right-aligned, friend's left-aligned)
   - Text input at bottom with send button
   - Auto-scroll to newest message on load
4. User types a message (max 500 chars) and taps Send
5. Message appears immediately in sender's thread (optimistic)
6. Backend persists message, sends via WebSocket to recipient
7. Recipient sees: real-time message in thread (if open), updated conversation list, unread badge increment, bell notification

**Alternate entry:** User taps "Message" button on a friend card → navigates to `/home?tab=messages&thread={player_id}`, opening that thread directly.

## Technical Design

### Data Model

New table: `direct_messages`

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | Auto-increment |
| sender_player_id | Integer FK → players | Message author |
| receiver_player_id | Integer FK → players | Message recipient |
| message_text | Text | Max 500 chars (enforced in API) |
| is_read | Boolean | Default false |
| read_at | DateTime | Null until read |
| created_at | DateTime | server_default=now |

**Indexes:**
- `(sender_player_id, receiver_player_id, created_at)` — thread queries
- `(receiver_player_id, is_read, created_at)` — unread count + conversation list
- `(sender_player_id, created_at)` — sender's conversation list

**Migration:** `025_add_direct_messages.py`

### API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/messages/conversations` | List conversations (paginated). Returns friend info, last message, unread count per thread | `require_verified_player` |
| GET | `/api/messages/conversations/{player_id}` | Get messages in a thread with a specific player (paginated, newest first) | `require_verified_player` |
| POST | `/api/messages/send` | Send a message. Body: `{ receiver_player_id, message_text }` | `require_verified_player` |
| PUT | `/api/messages/conversations/{player_id}/read` | Mark all messages from `player_id` as read | `require_verified_player` |
| GET | `/api/messages/unread-count` | Total unread message count (across all conversations) | `require_verified_player` |

**Send message flow:**
1. Validate `receiver_player_id` exists and `are_friends()` is true
2. Validate `message_text` is 1–500 chars, non-empty after trim
3. Insert `direct_messages` row
4. Send WebSocket message: `{ "type": "direct_message", "message": { ...DirectMessageResponse } }` to receiver's `user_id`
5. Create notification: type=`direct_message`, title="{sender_name} sent you a message", link_url="/home?tab=messages&thread={sender_player_id}"
6. Return created message

**Conversations list query:**
- Union of sent + received messages, grouped by the "other" player_id
- For each conversation: last message text, last message timestamp, unread count (where receiver=me AND is_read=false)
- Sorted by last message timestamp DESC
- Include friend's full_name, avatar via player join

### Backend Files

| File | Action |
|---|---|
| `apps/backend/services/direct_message_service.py` | **New** — send, get_conversations, get_thread, mark_read, get_unread_count |
| `apps/backend/api/routes/messages.py` | **New** — API route definitions |
| `apps/backend/api/routes/__init__.py` | Register messages router |
| `apps/backend/database/models.py` | Add `DirectMessage` model, add `direct_message` to `NotificationType` |
| `apps/backend/models/schemas.py` | Add `DirectMessageResponse`, `ConversationResponse`, `SendMessageRequest` |
| `apps/backend/alembic/versions/025_add_direct_messages.py` | **New** — migration |

### Frontend Components

| Component | Action | Responsibility |
|---|---|---|
| `MessagesTab.jsx` | **New** | Top-level tab: shows ConversationList or ThreadView based on URL param |
| `ConversationList.jsx` | **New** | Paginated list of conversations with avatar, name, preview, unread dot |
| `ThreadView.jsx` | **New** | Message bubbles, text input, auto-scroll, mark-as-read on open |
| `MessagesTab.css` | **New** | Styles for all messaging components |
| `HomeMenuBar.jsx` | **Modify** | Add Messages tab item (with `MessageCircle` icon from lucide-react) |
| `HomePage.jsx` | **Modify** | Add `messages` case to tab renderer |
| `NotificationContext.jsx` | **Modify** | Handle `direct_message` WS type: update unread message count state |
| `FriendsTab.jsx` | **Modify** | Add "Message" button to friend cards |
| `PublicPlayerPage.jsx` | **Modify** | Add "Message" button (when friends) |
| `api.js` (or equivalent) | **Modify** | Add `getConversations`, `getThread`, `sendMessage`, `markThreadRead`, `getUnreadMessageCount` API functions |

### WebSocket Integration

**Backend:** In `direct_message_service.send_message()`, after DB insert:
```python
await manager.send_to_user(receiver_user_id, {
    "type": "direct_message",
    "message": { ...serialized DirectMessageResponse }
})
```

**Frontend:** In `NotificationContext.jsx`, extend `onmessage` handler:
```js
if (data.type === 'direct_message') {
    // Dispatch to messaging state (context or callback)
    // Increment unread message count
}
```

Unread message count is separate from notification unread count — it gets its own badge on the Messages tab.

## Edge Cases & Error Handling

- **Unfriended mid-conversation:** Send endpoint checks `are_friends()` on every send. Returns 403 "You must be friends to send messages." Thread view shows disabled input with explanation text.
- **Recipient offline:** Message persists in DB. Notification created. They see it when they next open the app.
- **500-char limit exceeded:** Frontend disables send button + shows char counter when approaching limit. Backend validates and returns 400.
- **Empty message:** Frontend disables send for whitespace-only. Backend trims and validates length > 0.
- **Conversation with self:** Backend rejects `sender_player_id == receiver_player_id` with 400.
- **Rapid sends:** No rate limiting in V1 (friends-only constraint limits abuse surface). Can add later if needed.
- **Thread view open when new message arrives:** Append to thread in real-time via WS. Auto-mark as read (since user is viewing it).
- **Player with no friends:** Messages tab shows empty state: "No conversations yet. Add friends to start messaging!" with button linking to Friends tab.

## UI/UX Notes

- **Messages tab position:** In desktop sidebar, between Friends and Notifications. On mobile, in the "More" overflow menu.
- **Conversation list:** Follow existing FriendsTab card pattern — avatar circle, primary text (name), secondary text (message preview in `var(--gray-600)`), timestamp in `var(--gray-500)`, unread dot in `var(--primary)`.
- **Thread view:** Message bubbles — own messages right-aligned with `var(--primary)` background + white text, friend's messages left-aligned with `var(--gray-100)` background + `var(--gray-900)` text. Border-radius: 16px with squared corner on the "tail" side.
- **Text input:** Sticky to bottom of thread view. Single-line expanding to multi-line (max 3 lines). Send button (arrow icon) enabled only when input is non-empty.
- **Unread badge:** Small circle badge on Messages tab icon (same pattern as notification bell badge). Uses `var(--primary)` background.
- **Timestamps:** Relative ("2m ago", "1h ago") in conversation list. In thread view, show time for each message, date separator for different days.
- **"Message" button on friend cards:** Small icon button (MessageCircle from lucide), same row as existing action buttons.

## Testing Plan

### Critical Path (P0)
- Send message → appears in sender's thread immediately
- Send message → recipient receives via WebSocket in real-time
- Send message → recipient sees unread badge on Messages tab
- Send message → recipient gets bell notification
- Conversation list shows correct last message, timestamp, unread count
- Opening a thread marks messages as read
- Unfriended users cannot send messages (403)

### Important (P1)
- Conversation list pagination
- Thread message pagination (scroll up to load older)
- Empty state renders with CTA to Friends tab
- "Message" button on friend card navigates to correct thread
- 500-char limit enforced (frontend + backend)
- Thread auto-scrolls to newest message on load
- New message arrives while thread is open → appended + auto-read

### Nice to Have (P2)
- Multiple tabs open: unread count stays in sync
- Unfriend → thread shows read-only state with explanation
- Re-friend → thread unlocked, can send again
- Mobile responsive layout for thread view
