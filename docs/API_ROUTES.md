# API Routes Reference

Source: `apps/backend/api/routes/` (~160 endpoints across 14 domain modules) + `apps/backend/api/public_routes.py` (~14 endpoints)

## Auth Levels

| Dependency | Description |
|-----------|-------------|
| None | Public, no auth required |
| `require_user` | Any authenticated user |
| `require_verified_player` | Verified user with player profile (returns `player_id`) |
| `require_system_admin` | Platform-wide admin (phone in settings) |
| `require_admin_phone` | Hardcoded admin phone |
| `make_require_league_admin()` | League admin or system admin |
| `make_require_league_member()` | League member or system admin |
| `make_require_league_admin_from_season()` | League admin via season_id |
| `make_require_league_admin_from_schedule()` | League admin via schedule_id |
| `make_require_league_admin_from_signup()` | League admin via signup_id |

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | None | Register with phone + password, sends SMS code |
| POST | `/api/auth/login` | None | Login with phone + password |
| POST | `/api/auth/send-verification` | None | Resend SMS verification code |
| POST | `/api/auth/verify-phone` | None | Verify phone with SMS code, returns tokens |
| POST | `/api/auth/reset-password` | None | Initiate password reset (sends SMS) |
| POST | `/api/auth/reset-password-verify` | None | Verify reset code, returns reset token |
| POST | `/api/auth/reset-password-confirm` | None | Set new password with reset token |
| POST | `/api/auth/sms-login` | None | Passwordless SMS login |
| GET | `/api/auth/check-phone` | None | Check if phone number is registered |
| POST | `/api/auth/refresh` | None | Refresh access token |
| POST | `/api/auth/logout` | User | Revoke refresh token |
| GET | `/api/auth/me` | User | Get current user profile |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/api/users/me` | User | Update user profile (email, password) |
| GET | `/api/users/me/player` | User | Get current user's player profile |
| PUT | `/api/users/me/player` | User | Update player profile fields |
| POST | `/api/users/me/avatar` | User | Upload avatar image (multipart) |
| DELETE | `/api/users/me/avatar` | User | Remove avatar |
| GET | `/api/users/me/leagues` | User | List leagues for current user |

## Players

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/players` | User | Search/list players (query params: search, league_id) |
| POST | `/api/players` | User | Create player profile |
| POST | `/api/players/placeholder` | Verified Player | Create placeholder player |
| GET | `/api/players/placeholder` | Verified Player | List placeholder players created by current user |
| DELETE | `/api/players/placeholder/{player_id}` | Verified Player | Delete placeholder player |
| GET | `/api/players/{player_id}/invite-url` | Verified Player | Get/create invite URL for placeholder |
| GET | `/api/invites/{token}` | None | Get invite details by token |
| POST | `/api/invites/{token}/claim` | User | Claim placeholder invite |
| GET | `/api/players/{player_id}/matches` | None | Get player match history |
| GET | `/api/players/{player_id}/stats` | None | Get player global stats |
| GET | `/api/players/{player_id}/season/{season_id}/stats` | None | Get player season stats |
| GET | `/api/players/{player_id}/season/{season_id}/partnership-opponent-stats` | None | Get player partnership/opponent stats for season |
| GET | `/api/players/{player_id}/league/{league_id}/stats` | None | Get player league stats |
| GET | `/api/players/{player_id}/league/{league_id}/partnership-opponent-stats` | None | Get player partnership/opponent stats for league |

## Leagues

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/leagues` | User | Create league |
| GET | `/api/leagues` | None | List all leagues |
| POST | `/api/leagues/query` | Optional | Query leagues with filters & pagination |
| GET | `/api/leagues/{league_id}` | User | Get league by ID |
| PUT | `/api/leagues/{league_id}` | League Admin | Update league |
| DELETE | `/api/leagues/{league_id}` | System Admin | Delete league |
| GET | `/api/leagues/{league_id}/members` | User | List league members |
| POST | `/api/leagues/{league_id}/members` | League Admin | Add player to league |
| POST | `/api/leagues/{league_id}/members_batch` | League Admin | Batch add players |
| PUT | `/api/leagues/{league_id}/members/{member_id}` | League Admin | Update member role |
| DELETE | `/api/leagues/{league_id}/members/{member_id}` | League Admin | Remove member |
| POST | `/api/leagues/{league_id}/join` | User | Join open league |
| POST | `/api/leagues/{league_id}/request-join` | User | Request to join invite-only league |
| POST | `/api/leagues/{league_id}/join-requests/{request_id}/approve` | League Admin | Approve join request |
| POST | `/api/leagues/{league_id}/join-requests/{request_id}/reject` | League Admin | Reject join request |
| POST | `/api/leagues/{league_id}/leave` | User | Leave league |
| GET | `/api/leagues/{league_id}/messages` | League Member | Get league messages |
| POST | `/api/leagues/{league_id}/messages` | League Member | Post league message |

## Seasons

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/leagues/{league_id}/seasons` | League Admin | Create season |
| GET | `/api/leagues/{league_id}/seasons` | User | List seasons for league |
| GET | `/api/seasons/{season_id}` | None | Get season by ID |
| PUT | `/api/seasons/{season_id}` | User* | Update season (*admin check in service) |

## Sessions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leagues/{league_id}/sessions` | User | List league sessions |
| POST | `/api/leagues/{league_id}/sessions` | League Member | Create session in league |
| PATCH | `/api/leagues/{league_id}/sessions/{session_id}` | League Admin | Update league session |
| GET | `/api/sessions/open` | User | List open sessions for current user |
| GET | `/api/sessions/by-code/{code}` | User | Get session by shareable code |
| GET | `/api/sessions/{session_id}/matches` | None | Get matches for session |
| GET | `/api/sessions/{session_id}/participants` | User | Get session participants |
| DELETE | `/api/sessions/{session_id}/participants/{player_id}` | User | Remove participant from session |
| POST | `/api/sessions/join` | User | Join session by code |
| POST | `/api/sessions/{session_id}/invite` | User | Invite player to session |
| POST | `/api/sessions/{session_id}/invite_batch` | User | Batch invite players to session |
| POST | `/api/sessions` | User | Create standalone session |
| PATCH | `/api/sessions/{session_id}` | User | Update session (status, name) |
| DELETE | `/api/sessions/{session_id}` | User | Delete session |

## Matches

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/matches` | User | Create match |
| PUT | `/api/matches/{match_id}` | User | Update match |
| DELETE | `/api/matches/{match_id}` | User | Delete match |
| POST | `/api/matches/elo` | None | Get matches with ELO changes (by season_id or league_id) |
| POST | `/api/matches/search` | None | Search matches with filters |
| GET | `/api/matches/export` | None | Export matches as CSV |

### Photo Match Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/leagues/{league_id}/matches/upload-photo` | League Member | Upload scoresheet photo for AI extraction |
| POST | `/api/leagues/{league_id}/matches/photo-sessions/{session_id}/edit` | League Member | Edit extracted matches before confirming |
| GET | `/api/leagues/{league_id}/matches/photo-jobs/{job_id}/stream` | League Member | SSE stream for job progress |
| GET | `/api/leagues/{league_id}/matches/photo-jobs/{job_id}` | League Member | Get job status |
| POST | `/api/leagues/{league_id}/matches/photo-sessions/{session_id}/confirm` | League Member | Confirm and save extracted matches |
| DELETE | `/api/leagues/{league_id}/matches/photo-sessions/{session_id}` | League Member | Cancel photo session |

## Stats & Rankings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/player-stats` | None | Get player stats (by season_id or league_id) |
| GET | `/api/seasons/{season_id}/player-stats` | None | Get season player stats (deprecated) |
| GET | `/api/seasons/{season_id}/matches` | None | Get season matches (deprecated) |
| POST | `/api/partnership-opponent-stats` | None | Get partnership/opponent stats (by season_id or league_id) |
| GET | `/api/seasons/{season_id}/partnership-opponent-stats` | None | Season partnership stats (deprecated) |
| GET | `/api/leagues/{league_id}/player-stats` | None | Get league player stats |
| GET | `/api/leagues/{league_id}/partnership-opponent-stats` | None | Get league partnership stats |
| GET | `/api/elo-timeline` | None | Get ELO timeline for player |
| POST | `/api/rankings` | None | Get rankings with filters |
| POST | `/api/calculate` | League Admin | Trigger stats calculation |
| POST | `/api/calculate-stats` | League Admin | Trigger stats calculation (alias) |
| GET | `/api/calculate-stats/status` | User | Get all pending/running jobs |
| GET | `/api/calculate-stats/status/{job_id}` | User | Get job status by ID |
| POST | `/api/loadsheets` | League Admin | Import matches from Google Sheets |

## Courts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/courts` | User | Create court (admin) |
| GET | `/api/courts` | User | List courts for location |
| PUT | `/api/courts/{court_id}` | User | Update court (admin) |
| DELETE | `/api/courts/{court_id}` | User | Delete court (admin) |
| POST | `/api/courts/submit` | Verified Player | Submit new court for approval |
| PUT | `/api/courts/{court_id}/update` | Verified Player | Update own court |
| POST | `/api/courts/{court_id}/reviews` | Verified Player | Create court review |
| PUT | `/api/courts/{court_id}/reviews/{review_id}` | Verified Player | Update own review |
| DELETE | `/api/courts/{court_id}/reviews/{review_id}` | Verified Player | Delete own review |
| POST | `/api/courts/{court_id}/reviews/{review_id}/photos` | Verified Player | Upload review photos |
| POST | `/api/courts/{court_id}/suggest-edit` | Verified Player | Suggest court info edit |
| GET | `/api/courts/{court_id}/suggestions` | Admin | List edit suggestions |
| PUT | `/api/courts/suggestions/{suggestion_id}` | Admin | Approve/reject suggestion |

### Court Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/courts/pending` | System Admin | List pending court submissions |
| PUT | `/api/admin/courts/{court_id}/approve` | System Admin | Approve court |
| PUT | `/api/admin/courts/{court_id}/reject` | System Admin | Reject court |

## Locations & Geography

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/locations` | Admin | Create location |
| GET | `/api/locations` | None | List all locations |
| GET | `/api/regions` | None | List all regions |
| GET | `/api/locations/distances` | None | Get distances from player to locations |
| GET | `/api/geocode/autocomplete` | User | Geocode address autocomplete |
| PUT | `/api/locations/{location_id}` | Admin | Update location |
| DELETE | `/api/locations/{location_id}` | Admin | Delete location |

## Weekly Schedules & Signups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/seasons/{season_id}/weekly-schedules` | League Admin (via season) | Create weekly schedule |
| GET | `/api/seasons/{season_id}/weekly-schedules` | League Member (via season) | List weekly schedules |
| PUT | `/api/weekly-schedules/{schedule_id}` | League Admin (via schedule) | Update schedule |
| DELETE | `/api/weekly-schedules/{schedule_id}` | League Admin (via schedule) | Delete schedule |
| POST | `/api/seasons/{season_id}/signups` | League Admin (via season) | Create signup |
| GET | `/api/seasons/{season_id}/signups` | League Member (via season) | List signups for season |
| GET | `/api/signups/{signup_id}` | User | Get signup with players |
| PUT | `/api/signups/{signup_id}` | League Admin (via signup) | Update signup |
| DELETE | `/api/signups/{signup_id}` | League Admin (via signup) | Delete signup |
| POST | `/api/signups/{signup_id}/signup` | User | Sign up for a slot |
| POST | `/api/signups/{signup_id}/dropout` | User | Drop out of a slot |
| GET | `/api/signups/{signup_id}/players` | User | Get signup player list |
| GET | `/api/signups/{signup_id}/events` | User | Get signup event audit log |

## Friends

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/friends/request` | Verified Player | Send friend request |
| POST | `/api/friends/requests/{request_id}/accept` | Verified Player | Accept friend request |
| POST | `/api/friends/requests/{request_id}/decline` | Verified Player | Decline friend request |
| DELETE | `/api/friends/requests/{request_id}` | Verified Player | Cancel sent friend request |
| DELETE | `/api/friends/{player_id}` | Verified Player | Remove friend |
| GET | `/api/friends` | Verified Player | List friends with mutual friend counts |
| GET | `/api/friends/requests` | Verified Player | List pending friend requests |
| GET | `/api/friends/suggestions` | Verified Player | Get friend suggestions |
| POST | `/api/friends/batch-status` | Verified Player | Get friendship status for multiple players |
| GET | `/api/friends/mutual/{other_player_id}` | Verified Player | Get mutual friends with player |

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | User | List notifications (paginated) |
| GET | `/api/notifications/unread-count` | User | Get unread notification count |
| PUT | `/api/notifications/{notification_id}/read` | User | Mark notification as read |
| PUT | `/api/notifications/mark-all-read` | User | Mark all notifications as read |
| WS | `/api/ws/notifications` | User (token in query) | Real-time notification WebSocket |

## Feedback & Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/feedback` | Optional | Submit feedback |
| GET | `/api/admin-view/feedback` | Admin Phone | List all feedback |
| PATCH | `/api/admin-view/feedback/{feedback_id}/resolve` | Admin Phone | Resolve feedback |
| GET | `/api/admin-view/config` | Admin Phone | Get admin config |
| PUT | `/api/admin-view/config` | Admin Phone | Update admin config |

## Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings/{key}` | User | Get setting value |
| PUT | `/api/settings/{key}` | System Admin | Update setting |

## WhatsApp (Inactive)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/whatsapp/qr` | Admin Phone | Get QR code |
| GET | `/api/whatsapp/status` | Admin Phone | Get connection status |
| POST | `/api/whatsapp/initialize` | Admin Phone | Initialize connection |
| POST | `/api/whatsapp/logout` | Admin Phone | Disconnect |
| GET | `/api/whatsapp/groups` | Admin Phone | List groups |
| POST | `/api/whatsapp/send` | Admin Phone | Send message |
| GET | `/api/whatsapp/config` | Admin Phone | Get config |
| POST | `/api/whatsapp/config` | Admin Phone | Update config |

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check |

---

## Public Routes (No Auth)

All prefixed with `/api/public`. Responses cached for 5 minutes.

### Sitemap

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/sitemap/leagues` | All public leagues for sitemap |
| GET | `/api/public/sitemap/players` | Players with >= 1 game |
| GET | `/api/public/sitemap/locations` | Locations with >= 1 league |
| GET | `/api/public/sitemap/courts` | Approved courts with slugs |

### Public Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/leagues` | Paginated public leagues with filters |
| GET | `/api/public/leagues/{league_id}` | Public league detail (limited for private leagues) |
| GET | `/api/public/players` | Search public players with filters |
| GET | `/api/public/players/{player_id}` | Public player profile |
| GET | `/api/public/locations` | Location directory grouped by region |
| GET | `/api/public/locations/{slug}` | Location detail by slug |
| GET | `/api/public/courts` | Paginated courts with filters & geo-sort |
| GET | `/api/public/courts/tags` | Curated court review tags |
| GET | `/api/public/courts/nearby` | Courts near lat/lng |
| GET | `/api/public/courts/{slug}` | Court detail by slug |
