# Wave 5 — Leagues: Wireframe Diff

Documents intentional deviations from the wireframe HTML files for the Leagues domain
(league detail, league invite, pending invites, find leagues, create league screens).

---

## League Detail (`league-detail.html` vs `LeagueDetailScreen`)

### Implemented as specified
- Header with league name, location badge, member count
- Active season name badge (rendered when `is_active` is true)
- User rank badge (rendered when `user_rank` is present)
- 5-tab segment bar: Games / Standings / Chat / Sign Ups / Info
- "Invite Players" button visible to all members and admins
- "Start Session" button visible to admins only
- Loading and error states

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Player stats drill-down pushes a new route | `LeagueStatsTab` renders inline within the Standings tab via local `statsPlayerId` state | Avoids a separate `/(stack)/league/[id]/stats/[playerId]` route for MVP; same data displayed inline |
| Season selector in header dropdown | Season selector is inside the Standings tab (season picker pills) | Keeps the header compact; season context is only relevant in the Standings and Stats views |
| Cover photo / banner image in header | Not implemented | Requires media upload API; deferred |

---

## League Dashboard / Standings (`league-dashboard.html` vs `LeagueDashboardTab`)

### Implemented as specified
- Season picker (horizontal scrollable pill buttons; active season highlighted)
- Standings table: rank, initials avatar, display name, W-L, Win%, Rating
- Rating delta indicator (+ or - relative to prior period) when provided
- Season info card: season name, start date, session count, total game count

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| "View Stats" button per row navigates to player stats page | Row press calls `onPressPlayer` handler; stats render inline (see above) | Same data path, no separate route |
| Win streak badge | Not implemented | Not in the `LeagueStanding` schema; deferred |

---

## League Chat (`league-chat.html` vs `LeagueChatTab`)

### Implemented as specified
- Message list with date dividers (grouped by calendar day)
- My messages: right-aligned, teal bubble
- Other messages: left-aligned, white bubble with initials avatar and sender name on first message
- Input bar with send button (disabled while sending)
- Keyboard avoiding view

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Message reactions (emoji) | Not implemented | Requires dedicated reaction API; `TODO(backend)` |
| Image/media attachments in chat | Not implemented | Requires media upload API; deferred |
| Message read receipts | Not implemented | Real-time infra (WebSocket/SSE) not yet wired |

---

## League Matches (`league-matches.html` vs `LeagueMatchesTab`)

### Implemented as specified
- List of games with date, opponents, scores, win/loss result badge
- Empty state when no games found

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Filter by opponent or date range | Not implemented for MVP | API `getMyGames` does not yet accept per-league filters; deferred |

---

## League Sign-Ups (`league-signups.html` vs `LeagueSignupsTab`)

### Implemented as specified
- List of signup events with title, date, spots remaining, and join button
- Empty state when no events scheduled

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| "Create signup event" button for admins | Not implemented | Requires create-event API; `TODO(backend)` |

---

## League Info (`league-info.html` vs `LeagueInfoTab`)

### Implemented as specified
- Description, access type, level, location, home court
- Members list with avatars, names, roles
- Seasons list with status badges
- Admin-only join-requests section with accept/decline buttons

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Edit league settings (name, description, etc.) | Not shown; navigates via `routes.editLeague` placeholder | Edit screen is a separate Wave 6+ feature |
| Member removal (kick) | Not implemented | Requires moderation API; `TODO(backend)` |

---

## Find Leagues (`find-leagues.html` vs `FindLeaguesScreen`)

### Implemented as specified
- Search input (debounced, passes `query` to `findLeagues`)
- Filter chips: All / Public / Invite Only / Nearby
- League result cards: name, gender, level, access type, location, member count, friends-in-league count
- "Request to Join" / "Request Sent" button per card
- Loading, empty, and error states

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| "Nearby" filter using GPS location | Filter chip rendered; triggers `findLeagues({ nearby: true })` but backend returns unfiltered results | Geolocation and radius search are `TODO(backend)` |
| Friends-in-league avatars row | Friend count shown as plain text (e.g. "2 friends") | Avatar data not in `findLeagues` response; deferred |
| Map view toggle | Not implemented | Deferred with the map stub from Courts domain |

---

## Create League (`create-league.html` vs `CreateLeagueScreen`)

### Implemented as specified
- League name input (required, 2+ chars to enable submit)
- Description input (optional, multiline)
- Access type toggle: Open / Invite Only
- Gender pills: Men's / Women's / Co-ed
- Level options: Recreational / AA / Open / Elite
- Submit button disabled until valid; shows inline error on failure
- On success: navigates to `routes.leagueDetail(id)` for the new league

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Home court selector (autocomplete) | Not implemented for MVP | Requires courts search integration; `TODO(backend)` |
| League avatar / cover photo upload | Not implemented | Requires media upload API; deferred |

---

## League Invite (`league-invite.html` vs `LeagueInviteScreen`)

### Implemented as specified
- Search input filters player list by name
- Players grouped by section: Friends / Recent Opponents / Suggested
- Section header labels between groups
- Player rows: checkbox, initials avatar, display name, level, location, status badge
- Member / invited / requested rows are non-selectable (opacity dimmed, `accessibilityState.disabled`)
- Send button label updates with selection count: "Send (N)"
- Send button disabled when no players selected
- Share Link button
- Loading, empty, and error states

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Share Link copies deep-link URL to clipboard / opens share sheet | Button renders with `testID="share-link-button"` but is not yet wired | Requires Expo Sharing and deep-link generation API; `TODO(backend)` |
| Backend `POST /api/leagues/:id/invites` | `sendLeagueInvites` calls `notImplemented()` and always throws in the mock | Endpoint not yet implemented; mock records the call for test verification |

---

## Pending Invites (`pending-invites.html` vs `PendingInvitesScreen`)

### Implemented as specified
- List of sent invites: invitee avatar, display name, league name, invite date, status badge
- Status badges: Pending (gold) / Joined (green) / Declined (red)
- Loading, empty, and error states

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Resend / cancel invite actions | Not implemented | Requires invite management API endpoints; `TODO(backend)` |
| Filter tabs (All / Pending / Accepted) | Not implemented for MVP | Single list sufficient at current data scale |
