# Backend Patterns Reference

## Architecture

```
routes.py (or routes/*.py)  →  services/*.py  →  database/models.py
     ↓                              ↓
auth_dependencies.py         database/db.py (async sessions)
```

## Auth Dependency Chain

```
get_current_user          → Extracts user from JWT token
  ↓
require_user              → Alias, any authenticated user
  ↓
require_verified_player   → Verified + has player profile (adds player_id)
```

League-scoped auth (factory functions returning FastAPI dependencies):
- `make_require_league_admin()` — from `league_id` path param
- `make_require_league_member()` — from `league_id` path param
- `make_require_league_admin_from_season()` — from `season_id`
- `make_require_league_admin_from_schedule()` — from `schedule_id`
- `make_require_league_admin_from_signup()` — from `signup_id`

System admin: `require_system_admin` (phone in `settings.system_admin_phone_numbers`)

## Stats Recalculation

1. Route calls `get_stats_queue().enqueue(calc_type, league_id)` → creates `StatsCalculationJob` row
2. Background worker picks up job → `calculation_service.py` processes
3. Recalculates: player_season_stats, player_league_stats, player_global_stats, partnership/opponent stats, ELO/rating history

## Notifications

`notification_service.py` creates `Notification` rows with:
- `type` (NotificationType enum)
- `data` (JSON string with context: league_id, player_id, etc.)
- `link_url` (frontend navigation target)

Real-time delivery via WebSocket at `/api/ws/notifications`.

## Key File Paths

| Task | Files |
|------|-------|
| Add API endpoint | `apps/backend/api/routes.py`, `apps/backend/models/schemas.py` |
| Add service logic | `apps/backend/services/<domain>_service.py` |
| Add DB table | `apps/backend/database/models.py`, new migration in `apps/backend/alembic/versions/` |
| Auth/permissions | `apps/backend/api/auth_dependencies.py` |
| Stats calculation | `apps/backend/services/calculation_service.py`, `stats_queue.py` |
| Notifications | `apps/backend/services/notification_service.py` |
| Public/SEO routes | `apps/backend/api/public_routes.py`, `apps/backend/services/public_service.py` |
| Court features | `apps/backend/services/court_service.py`, `court_photo_service.py` |
| Friend system | `apps/backend/services/friend_service.py` |
| Placeholder/invite | `apps/backend/services/placeholder_service.py` |

## Service Files

| Service | Responsibility |
|---------|---------------|
| `data_service.py` | Core CRUD for leagues, seasons, sessions, matches, members, stats |
| `auth_service.py` | JWT token creation/verification, phone normalization |
| `user_service.py` | User CRUD, player profile management |
| `calculation_service.py` | Stats recalculation engine (ELO, points, win rates) |
| `stats_queue.py` | Job queue for async stats calculation |
| `notification_service.py` | Create notification rows, notify helpers |
| `friend_service.py` | Friend requests, friend list, suggestions, mutual friends |
| `placeholder_service.py` | Placeholder player CRUD, invite token management |
| `court_service.py` | Court CRUD, reviews, tags, suggestions, public listing |
| `court_photo_service.py` | Court review photo upload to S3 |
| `photo_match_service.py` | AI-powered scoresheet photo extraction (Gemini) |
| `public_service.py` | Public/SEO data (no auth needed) |
| `s3_service.py` | AWS S3 upload/delete operations |
| `avatar_service.py` | Player avatar upload/management |
| `geocoding_service.py` | Geoapify address autocomplete |
| `location_service.py` | Location CRUD and distance calculations |
| `email_service.py` | SendGrid email sending |
| `rate_limiting_service.py` | Rate limit configuration |
| `settings_service.py` | Key-value settings CRUD |
| `redis_service.py` | Redis connection and operations |
| `websocket_manager.py` | WebSocket connection management for notifications |
