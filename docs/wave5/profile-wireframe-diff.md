# Wave 5 — Profile & Settings: Wireframe Diff

Documents intentional deviations from the wireframe HTML files for the Profile & Settings domain
(player-profile, settings, settings-account, settings-notifications, change-password screens).

---

## Player Profile (`player-profile.html` vs `PlayerProfileScreen`)

### Implemented as specified
- TopNav with back chevron and "•••" right action opening action sheet
- Profile header: avatar initial, name, city/state, level badge, Add Friend / Message CTAs
- Mutual friends horizontal scroll strip (hidden when empty)
- Stats grid: Win Rate, Rating, Record, Games Played
- Leagues list with rank and games played
- Trophies horizontal scroll (hidden when empty)
- Skeleton loading state
- Error state with retry button
- Pull-to-refresh via `RefreshControl`
- Action sheet: Block User, Report User, Cancel

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `avatar-img` real profile photo | Avatar initial only | Profile picture upload flow is a separate domain; `profile_picture_url` is plumbed but not rendered as `<Image>` yet |
| `friend-status-pending` / `friend-status-friends` button variants | Implemented via `friendStatus` prop on header | Status is read from `batchFriendStatus` API; button label changes to "Pending" when pending |
| `trophy-detail` modal on trophy tap | Not implemented | Deferred; trophy detail modal requires separate design spec |
| `league-rank-chart` sparkline per league row | Not shown | Deferred; requires per-league history API endpoint |
| `tab-games` / `tab-stats` sub-tabs below header | Not implemented | Inline sections (no tabs) are simpler for MVP; full tab pivot deferred |
| Trophies and leagues data | MOCK constants in hook | `TODO(backend)` markers in `usePlayerProfileScreen.ts`; real endpoints not yet available |

---

## Settings (`settings.html` vs `SettingsScreen`)

### Implemented as specified
- TopNav with "Settings" title
- Login & Security section: Email row (→ account settings), Password row (→ change password), Phone row
- Notifications row (→ notifications settings)
- Support section: Send Feedback, Contact Support, Rate App rows
- Log Out button (triggers modal confirmation)
- Delete Account row (in Danger Zone)
- Logout modal with Confirm / Cancel

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `settings-row-account` single "Account" row | Broken into Email / Password / Phone rows | More direct navigation per security-best-practice; avoids extra intermediate Account screen hop |
| `btn-delete` inline in main list | Rendered as a styled danger row | Consistent row pattern is better UX than a standalone button |
| Theme / Appearance toggle | Not implemented | Deferred; theme toggle (dark/light override) planned but not in scope for Wave 5 |

---

## Account Settings (`settings-account.html` vs `AccountSettingsScreen`)

### Implemented as specified
- TopNav with back and "Account" title
- Login & Security: Email row (masked), Password row (→ change password), Phone row
- Connected Accounts: Google (Connected), Apple (Connect)
- Privacy: Profile Visibility row, Game History row
- Danger Zone: Delete Account row (confirmation Alert)

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Live Google / Apple OAuth connect/disconnect | Static "Connected" / "Connect" labels | Full OAuth account-linking flow is a separate feature; static state for MVP |
| `privacy-picker` for Profile Visibility | Static row with "›" chevron | Picker modal deferred; backend privacy fields not yet wired |
| `privacy-picker` for Game History | Static row with "›" chevron | Same as above |
| Email change flow | Row is non-interactive (display only) | Email change requires verification flow (backend TODO) |
| Phone edit flow | Row is non-interactive (display only) | Phone change requires re-verification; deferred |

---

## Notifications Settings (`settings-notifications.html` vs `NotificationsSettingsScreen`)

### Implemented as specified
- TopNav with back and "Notifications" title
- Skeleton while prefs are loading
- Error state with retry button
- Master toggle (disables all notification types when off)
- Individual toggles: Direct Messages, League Messages, Friend Requests, Match Invites, Session Updates, Tournament Updates
- Quiet Hours row
- Optimistic toggle updates: UI flips immediately, API called async

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `quiet-hours-picker` time range selector | Static row with "›" chevron | Time picker modal deferred; backend quiet hours fields not yet wired |
| `notify-badge-count` in TopNav | Not implemented | Badge count is managed by the NotificationContext globally, not per-settings screen |
| Section dim / opacity when master is off | Not implemented via opacity | Individual toggles are still interactable but have no API effect when master is off; UX tradeoff accepted for MVP |

---

## Change Password (`settings-change-password.html` vs `ChangePasswordScreen`)

### Implemented as specified
- TopNav with back and "Change Password" title
- Current Password, New Password, Confirm New Password fields with show/hide toggle
- Keyboard chaining via refs (current → new → confirm)
- `KeyboardAvoidingView` for iOS/Android keyboard avoidance
- Validation: empty current, new < 8 chars, mismatch, same-as-current
- Error banner (`change-password-error`) with message
- Success banner (`change-password-success`) after submit
- Form clears on success

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Real password change API call | Simulated 600ms delay then success | `TODO(backend): POST /api/auth/change-password`; endpoint not yet available |
| `forgot-link` below current password | Not shown | Forgot password flow is initiated from the login screen; redundant here |
| `strength-meter` below new password | Not implemented | Password strength indicator is a polish item; 8-char minimum enforced |

---

## Notes on Backend TODOs

Several API methods used by these screens are stubs with `TODO(backend)` markers:

- `getPlayerStats(id)` — returns mock data; real endpoint exists but trophies/leagues sub-calls do not
- `getMutualFriends(id)` — wired to `api.getMutualFriends`; backend endpoint may not yet exist
- `batchFriendStatus(ids)` — wired to `api.batchFriendStatus`; backend endpoint may not yet exist
- `getPushNotificationPrefs()` — wired to `api.getPushNotificationPrefs`; backend endpoint pending
- `updatePushNotificationPrefs(prefs)` — wired to `api.updatePushNotificationPrefs`; backend endpoint pending
- `changePassword(current, new)` — not yet wired; simulated success in `ChangePasswordScreen`

When real endpoints ship, only the API client methods need updating; screen components and hooks remain unchanged.
