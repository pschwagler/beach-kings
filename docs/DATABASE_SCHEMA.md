# Database Schema Reference

PostgreSQL database with 45 tables. SQLAlchemy ORM models in `apps/backend/database/models.py`.

## Enums

| Enum | Values |
|------|--------|
| `SessionStatus` | `ACTIVE`, `SUBMITTED`, `EDITED` |
| `ScoringSystem` | `points_system`, `season_rating` |
| `OpenSignupsMode` | `auto_after_last_session`, `specific_day_time`, `always_open` |
| `SignupEventType` | `signup`, `dropout` |
| `FriendRequestStatus` | `pending`, `accepted` |
| `NotificationType` | `league_message`, `league_invite`, `league_join_request`, `season_start`, `season_activated`, `placeholder_claimed`, `friend_request`, `friend_accepted` |
| `InviteStatus` | `pending`, `claimed` |
| `StatsCalculationJobStatus` | `pending`, `running`, `completed`, `failed` |
| `PhotoMatchJobStatus` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` |

## Common Patterns

- **Audit trail**: Most tables have `created_at`, `updated_at`, `created_by` (FK → players.id), `updated_by` (FK → players.id)
- **Soft timestamps**: `created_at`/`updated_at` use `DateTime(timezone=True)` with `server_default=func.now()`
- **String dates**: Some legacy tables store dates as ISO strings (`expires_at`, `date` on matches/sessions)

---

## Auth & Users

### `users`
User accounts with phone-based authentication.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | Auto-increment |
| `phone_number` | String | **Unique**, not null |
| `password_hash` | String | Not null |
| `email` | String | Nullable |
| `is_verified` | Boolean | Default `true` |
| `failed_verification_attempts` | Integer | Default `0` |
| `locked_until` | String | ISO timestamp, nullable |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

Indexes: `idx_users_phone`, `idx_users_phone_verified`

### `players`
Player profiles. Can be real (linked to user) or placeholder (is_placeholder=true).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | Auto-increment |
| `full_name` | String | Not null |
| `user_id` | Integer FK → users.id | Nullable (null for placeholders) |
| `nickname` | String | For name matching only, not display |
| `gender` | String | Nullable |
| `level` | String | Nullable |
| `date_of_birth` | Date | Nullable |
| `height` | String | Nullable |
| `preferred_side` | String | Nullable |
| `location_id` | String FK → locations.id | Nullable |
| `city` | String | Nullable |
| `state` | String | Nullable |
| `city_latitude` | Float | Nullable |
| `city_longitude` | Float | Nullable |
| `distance_to_location` | Float | Miles, nullable |
| `profile_picture_url` | String | Nullable |
| `avatar` | String | Initials or image URL |
| `avp_playerProfileId` | Integer | AVP integration, nullable |
| `status` | String | Nullable |
| `is_placeholder` | Boolean | Default `false` |
| `created_by_player_id` | Integer FK → players.id | ON DELETE SET NULL |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

Indexes: `idx_players_name`, `idx_players_user`, `idx_players_location`, `idx_players_avp_id`, `idx_players_created_by`

### `verification_codes`
SMS verification codes with signup data.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `phone_number` | String | Not null |
| `code` | String | Not null |
| `expires_at` | String | ISO timestamp |
| `used` | Boolean | Default `false` |
| `password_hash` | String | Nullable (stored during signup flow) |
| `name` | String | Nullable |
| `email` | String | Nullable |
| `created_at` | DateTime(tz) | |

### `refresh_tokens`
JWT refresh tokens for token rotation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `user_id` | Integer FK → users.id | ON DELETE CASCADE |
| `token` | String | **Unique**, not null |
| `expires_at` | String | ISO timestamp |
| `created_at` | DateTime(tz) | |

### `password_reset_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `user_id` | Integer FK → users.id | ON DELETE CASCADE |
| `token` | String | **Unique**, not null |
| `expires_at` | String | ISO timestamp |
| `used` | Boolean | Default `false` |
| `created_at` | DateTime(tz) | |

---

## Geography

### `regions`
Geographic regions (e.g., "Hawaii", "California").

| Column | Type | Notes |
|--------|------|-------|
| `id` | String PK | Lowercase snake_case (e.g., `hawaii`) |
| `name` | String | **Unique**, display name |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

### `locations`
Metropolitan areas / hubs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String PK | From CSV hub_id (e.g., `socal_la`, `hi_oahu`) |
| `name` | String | Not null |
| `city` | String | Nullable |
| `state` | String | Nullable |
| `country` | String | Default `USA` |
| `region_id` | String FK → regions.id | Nullable |
| `tier` | Integer | 1-4, nullable |
| `latitude` | Float | Nullable |
| `longitude` | Float | Nullable |
| `seasonality` | String | e.g., "Year-Round", "Jun-Aug" |
| `radius_miles` | Float | Nullable |
| `slug` | String(100) | **Unique**, SEO-friendly URL slug |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

### `courts`
Court locations with discovery & review support.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String | Not null |
| `address` | String | Nullable |
| `location_id` | String FK → locations.id | Not null |
| `geoJson` | Text | Nullable |
| `description` | Text | Nullable |
| `court_count` | Integer | Nullable |
| `surface_type` | String(50) | `sand`, `grass`, `indoor_sand` |
| `is_free` | Boolean | Nullable |
| `cost_info` | Text | Nullable |
| `has_lights` | Boolean | Nullable |
| `has_restrooms` | Boolean | Nullable |
| `has_parking` | Boolean | Nullable |
| `parking_info` | Text | Nullable |
| `nets_provided` | Boolean | Nullable |
| `hours` | Text | Nullable |
| `phone` | String(30) | Nullable |
| `website` | String(500) | Nullable |
| `latitude` | Float | Nullable |
| `longitude` | Float | Nullable |
| `average_rating` | Float | Nullable |
| `review_count` | Integer | Default `0` |
| `status` | String(20) | `pending`/`approved`/`rejected`, default `approved` |
| `is_active` | Boolean | Default `true` |
| `slug` | String(200) | **Unique** |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

Indexes: `idx_courts_location`, `idx_courts_slug`, `idx_courts_status`, `idx_courts_lat_lng`, `idx_courts_is_active`

### `court_tags`
Curated tags for court reviews.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String(50) | Not null |
| `slug` | String(50) | **Unique**, not null |
| `category` | String(30) | `quality`, `vibe`, `facility` |
| `sort_order` | Integer | Default `0` |

### `court_reviews`
User reviews for courts (one per user per court).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `court_id` | Integer FK → courts.id | ON DELETE CASCADE |
| `player_id` | Integer FK → players.id | ON DELETE CASCADE |
| `rating` | Integer | 1-5 stars (CHECK constraint) |
| `review_text` | Text | Nullable |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

Constraints: `uq_court_reviews_court_player` (one review per player per court), `ck_court_reviews_rating_range`

### `court_review_tags`
Join table: reviews ↔ curated tags.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `review_id` | Integer FK → court_reviews.id | ON DELETE CASCADE |
| `tag_id` | Integer FK → court_tags.id | ON DELETE CASCADE |

Constraint: `uq_court_review_tags_review_tag`

### `court_review_photos`
Photos attached to court reviews (max 3 per review).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `review_id` | Integer FK → court_reviews.id | ON DELETE CASCADE |
| `s3_key` | String(500) | Not null |
| `url` | String(500) | Not null |
| `sort_order` | Integer | Default `0` |
| `created_at` | DateTime(tz) | |

### `court_edit_suggestions`
User-submitted edit suggestions for court info.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `court_id` | Integer FK → courts.id | ON DELETE CASCADE |
| `suggested_by` | Integer FK → players.id | ON DELETE CASCADE |
| `changes` | JSONB | Field → new_value mapping |
| `status` | String(20) | `pending`/`approved`/`rejected` (CHECK) |
| `reviewed_by` | Integer FK → players.id | ON DELETE SET NULL |
| `created_at` | DateTime(tz) | |
| `reviewed_at` | DateTime(tz) | Nullable |

---

## Leagues

### `leagues`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String | Not null |
| `description` | Text | Nullable |
| `location_id` | String FK → locations.id | Nullable |
| `is_open` | Boolean | Default `true` (false = invite-only) |
| `is_public` | Boolean | Default `true` (visible on public pages) |
| `whatsapp_group_id` | String | Nullable |
| `gender` | String | `male`, `female`, `mixed` |
| `level` | String | `beginner`, `intermediate`, `advanced`, `Open`, etc. |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

### `league_configs`
One-to-one configuration per league.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | **Unique** |
| `point_system` | Text | Nullable (JSON scoring config) |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

### `league_members`
Join table: Player ↔ League.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | |
| `player_id` | Integer FK → players.id | |
| `role` | String | Default `member` (`admin` or `member`) |
| `created_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |

Constraint: UNIQUE(`league_id`, `player_id`)

### `league_messages`
League chat messages.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | |
| `user_id` | Integer FK → users.id | |
| `message_text` | Text | Not null |
| `created_at` | DateTime(tz) | |

### `league_requests`
Join requests for invite-only leagues.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | |
| `player_id` | Integer FK → players.id | |
| `status` | String | `pending`, `approved`, `rejected` |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

Constraint: `uq_league_request_league_player`

### `seasons`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | |
| `name` | String | Nullable |
| `start_date` | Date | Not null |
| `end_date` | Date | Not null |
| `scoring_system` | String(50) | `points_system` or `season_rating` (CHECK) |
| `point_system` | Text | JSON scoring configuration |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

Active seasons determined by: `current_date >= start_date AND current_date <= end_date`

---

## Sessions & Matches

### `sessions`
Gaming sessions grouped by date/time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `date` | String | Not null (string, not Date) |
| `name` | String | Not null |
| `status` | Enum(SessionStatus) | Default `ACTIVE` |
| `code` | String(12) | **Unique**, shareable code for invite links |
| `season_id` | Integer FK → seasons.id | Nullable |
| `court_id` | Integer FK → courts.id | Nullable |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

### `session_participants`
Players invited to a session.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `session_id` | Integer FK → sessions.id | ON DELETE CASCADE |
| `player_id` | Integer FK → players.id | ON DELETE CASCADE |
| `invited_by` | Integer FK → players.id | ON DELETE SET NULL |
| `created_at` | DateTime(tz) | |

Constraint: `uq_session_participants_session_player`

### `matches`
All match results (2v2 beach volleyball).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `session_id` | Integer FK → sessions.id | Nullable |
| `date` | String | Not null |
| `team1_player1_id` | Integer FK → players.id | Not null |
| `team1_player2_id` | Integer FK → players.id | Not null |
| `team2_player1_id` | Integer FK → players.id | Not null |
| `team2_player2_id` | Integer FK → players.id | Not null |
| `team1_score` | Integer | Not null |
| `team2_score` | Integer | Not null |
| `winner` | Integer | `1` = team1, `2` = team2, `-1` = tie |
| `is_public` | Boolean | Default `true` |
| `is_ranked` | Boolean | Default `true` (computed: ranked_intent + placeholder presence) |
| `ranked_intent` | Boolean | Default `true` (user's original choice, preserved across claims) |
| `created_by` | Integer FK → players.id | |
| `updated_by` | Integer FK → players.id | |

---

## Stats

### `player_season_stats`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `player_id` | Integer FK → players.id | |
| `season_id` | Integer FK → seasons.id | |
| `games` | Integer | Default `0` |
| `wins` | Integer | Default `0` |
| `points` | Float | Default `0.0` (for season_rating: stores float rating) |
| `win_rate` | Float | Default `0.0` |
| `avg_point_diff` | Float | Default `0.0` |

Constraint: UNIQUE(`player_id`, `season_id`)

### `player_global_stats`
Global aggregate stats across all leagues/seasons.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | Integer PK FK → players.id | |
| `current_rating` | Float | Default `1200.0` (ELO) |
| `total_games` | Integer | Default `0` |
| `total_wins` | Integer | Default `0` |
| `updated_at` | DateTime(tz) | |

### `player_league_stats`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `player_id` | Integer FK → players.id | |
| `league_id` | Integer FK → leagues.id | |
| `games` | Integer | Default `0` |
| `wins` | Integer | Default `0` |
| `points` | Integer | Default `0` |
| `win_rate` | Float | Default `0.0` |
| `avg_point_diff` | Float | Default `0.0` |

Constraint: UNIQUE(`player_id`, `league_id`)

### `partnership_stats`
How each player performs WITH each partner (global).

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | Integer PK FK → players.id | |
| `partner_id` | Integer PK FK → players.id | |
| `games` | Integer | |
| `wins` | Integer | |
| `points` | Integer | |
| `win_rate` | Float | |
| `avg_point_diff` | Float | |

**Note**: Uses `player_id` + `partner_id` (not player1/player2).

### `opponent_stats`
How each player performs AGAINST each opponent (global).

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | Integer PK FK → players.id | |
| `opponent_id` | Integer PK FK → players.id | |
| `games`, `wins`, `points`, `win_rate`, `avg_point_diff` | | Same pattern as partnership_stats |

### `partnership_stats_season`
Same as `partnership_stats` but scoped to a season.

PK: (`player_id`, `partner_id`, `season_id`)

### `opponent_stats_season`
Same as `opponent_stats` but scoped to a season.

PK: (`player_id`, `opponent_id`, `season_id`)

### `partnership_stats_league`
Same as `partnership_stats` but scoped to a league.

PK: (`player_id`, `partner_id`, `league_id`)

### `opponent_stats_league`
Same as `opponent_stats` but scoped to a league.

PK: (`player_id`, `opponent_id`, `league_id`)

### `elo_history`
Track ELO changes over time (global).

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | Integer PK FK → players.id | |
| `match_id` | Integer PK FK → matches.id | |
| `date` | String | |
| `elo_after` | Float | |
| `elo_change` | Float | |

### `season_rating_history`
Track season rating changes over time (season-specific).

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | Integer PK FK → players.id | |
| `season_id` | Integer PK FK → seasons.id | |
| `match_id` | Integer PK FK → matches.id | |
| `date` | String | |
| `rating_after` | Float | |
| `rating_change` | Float | |

---

## Signups

### `weekly_schedules`
Templates for recurring weekly signups.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `season_id` | Integer FK → seasons.id | |
| `day_of_week` | Integer | 0-6 (Monday=0) |
| `start_time` | String | HH:MM format |
| `duration_hours` | Float | Default `2.0` |
| `court_id` | Integer FK → courts.id | Nullable |
| `open_signups_mode` | Enum(OpenSignupsMode) | Default `auto_after_last_session` |
| `open_signups_day_of_week` | Integer | For `specific_day_time` mode |
| `open_signups_time` | String | HH:MM, for `specific_day_time` mode |
| `start_date` | Date | When to start generating signups |
| `end_date` | Date | |

### `signups`
Individual signup opportunities.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `season_id` | Integer FK → seasons.id | |
| `scheduled_datetime` | DateTime(tz) | UTC |
| `duration_hours` | Float | |
| `court_id` | Integer FK → courts.id | Nullable |
| `open_signups_at` | DateTime(tz) | UTC; NULL = always open |
| `weekly_schedule_id` | Integer FK → weekly_schedules.id | Nullable (null for ad-hoc) |

### `signup_players`
Join table: players signed up for a signup.

| Column | Type | Notes |
|--------|------|-------|
| `signup_id` | Integer PK FK → signups.id | ON DELETE CASCADE |
| `player_id` | Integer PK FK → players.id | ON DELETE CASCADE |
| `signed_up_at` | DateTime(tz) | UTC |

### `signup_events`
Audit log of signup/dropout actions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `signup_id` | Integer FK → signups.id | ON DELETE CASCADE |
| `player_id` | Integer FK → players.id | ON DELETE CASCADE |
| `event_type` | Enum(SignupEventType) | `signup` or `dropout` |
| `created_at` | DateTime(tz) | UTC |
| `created_by` | Integer FK → players.id | |

---

## Social

### `friends`
Friendship join table (Player ↔ Player).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `player1_id` | Integer FK → players.id | |
| `player2_id` | Integer FK → players.id | |
| `created_at` | DateTime(tz) | |
| `created_by` | Integer FK → players.id | |

Constraints: UNIQUE(`player1_id`, `player2_id`), **CHECK(`player1_id < player2_id`)** — always store smaller ID first.

### `friend_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `sender_player_id` | Integer FK → players.id | |
| `receiver_player_id` | Integer FK → players.id | |
| `status` | String(20) | Default `pending` |
| `created_at` | DateTime(tz) | |
| `responded_at` | DateTime(tz) | Nullable |

Constraint: `uq_friend_request_sender_receiver`

### `player_invites`
Invite links for placeholder players (1:1 with player).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `player_id` | Integer FK → players.id | ON DELETE CASCADE, **unique** |
| `invite_token` | String(64) | **Unique** |
| `created_by_player_id` | Integer FK → players.id | ON DELETE SET NULL |
| `phone_number` | String | Nullable |
| `status` | String | `pending` → `claimed` (CHECK) |
| `claimed_by_user_id` | Integer FK → users.id | ON DELETE SET NULL |
| `claimed_at` | DateTime(tz) | Nullable |
| `created_at` | DateTime(tz) | |

### `notifications`
In-app notifications.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `user_id` | Integer FK → users.id | |
| `type` | String | NotificationType enum value |
| `title` | String(255) | |
| `message` | Text | |
| `data` | Text | JSON string (league_id, message_id, etc.) |
| `is_read` | Boolean | Default `false` |
| `read_at` | DateTime(tz) | Nullable |
| `link_url` | String(500) | Navigation target |
| `created_at` | DateTime(tz) | |

Indexes: `idx_notifications_user_unread` (user_id, is_read, created_at), `idx_notifications_user_created`

### `feedback`
User feedback submissions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `user_id` | Integer FK → users.id | Nullable (anonymous) |
| `feedback_text` | Text | Not null |
| `email` | String | Optional contact email |
| `is_resolved` | Boolean | Default `false` |
| `created_at` | DateTime(tz) | |

---

## System

### `settings`
Key-value application configuration.

| Column | Type | Notes |
|--------|------|-------|
| `key` | String PK | |
| `value` | Text | Not null |
| `updated_at` | DateTime(tz) | |
| `updated_by` | Integer FK → players.id | |

Notable keys: `system_admin_phone_numbers` (comma-separated E.164 numbers)

### `stats_calculation_jobs`
Queue for stats calculation jobs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `calc_type` | String | `global` or `league` |
| `league_id` | Integer FK → leagues.id | Nullable |
| `season_id` | Integer FK → seasons.id | Deprecated |
| `status` | Enum(StatsCalculationJobStatus) | Default `pending` |
| `created_at` | DateTime(tz) | |
| `started_at` | DateTime(tz) | |
| `completed_at` | DateTime(tz) | |
| `error_message` | Text | |

### `photo_match_jobs`
Queue for photo-based match extraction jobs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `league_id` | Integer FK → leagues.id | |
| `session_id` | String | Redis session key |
| `status` | Enum(PhotoMatchJobStatus) | Default `PENDING` |
| `created_at` | DateTime(tz) | |
| `started_at` | DateTime(tz) | |
| `completed_at` | DateTime(tz) | |
| `error_message` | Text | |
| `result_data` | Text | JSON string of parsed matches |
