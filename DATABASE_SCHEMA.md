# Database Schema Documentation

## Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o| players : "has"
    players ||--o{ league_members : "member of"
    leagues ||--o{ league_members : "has"
    leagues ||--|| league_configs : "has"
    leagues ||--o{ seasons : "has"
    seasons ||--o{ sessions : "has"
    seasons ||--o{ player_season_stats : "tracks"
    players ||--o{ player_season_stats : "has stats"
    locations ||--o{ players : "default_location"
    locations ||--o{ leagues : "location"
    locations ||--o{ courts : "contains"
    courts ||--o{ sessions : "played at"
    players ||--o{ friends : "player1"
    players ||--o{ friends : "player2"
    sessions ||--o{ matches : "contains"

    users {
        int id PK
        text phone_number
        text password_hash
        text name
        text email
        int is_verified
        int failed_verification_attempts
        text locked_until
        datetime created_at
        datetime updated_at
    }

    players {
        int id PK
        text full_name
        int user_id FK
        text nickname
        text gender
        text level
        int age
        text height
        text preferred_side
        int default_location_id FK
        text profile_picture_url
        int avp_playerProfileId
        text status
        datetime created_at
        datetime updated_at
    }

    leagues {
        int id PK
        text name
        text description
        int location_id FK "nullable"
        int is_open
        text whatsapp_group_id
        int active_season_id FK
        datetime created_at
        datetime updated_at
    }

    league_configs {
        int id PK
        int league_id FK
        text point_system
        datetime created_at
        datetime updated_at
    }

    league_members {
        int id PK
        int league_id FK
        int player_id FK
        text role
        datetime created_at
    }

    seasons {
        int id PK
        int league_id FK
        text name
        date start_date
        date end_date
        text point_system
        int is_active
        datetime created_at
        datetime updated_at
    }

    sessions {
        int id PK
        text date
        text name
        int is_pending
        int season_id FK
        int court_id FK
        datetime created_at
    }

    player_season_stats {
        int id PK
        int player_id FK
        int season_id FK
        real current_elo
        int games
        int wins
        int points
        real win_rate
        real avg_point_diff
        datetime created_at
        datetime updated_at
    }

    locations {
        int id PK
        text name
        text city
        text state
        text country
        datetime created_at
        datetime updated_at
    }

    courts {
        int id PK
        text name
        text address
        int location_id FK
        text geoJson
        datetime created_at
        datetime updated_at
    }

    friends {
        int id PK
        int player1_id FK
        int player2_id FK
        datetime created_at
    }

    matches {
        int id PK
        int session_id FK
        text date
        int team1_player1_id
        int team1_player2_id
        int team2_player1_id
        int team2_player2_id
        int team1_score
        int team2_score
        int winner
    }
```

## Table Descriptions

### Core Tables

#### users
User accounts with phone-based authentication. Each user can claim one player profile.

#### players
Player profiles that can be seeded from AVP data. A player can be associated with one user (when claimed), but can exist without a user until claimed. Contains player information like name, gender, level, etc.

**Key Fields:**
- `full_name`: Player's full name (not unique, to allow duplicates)
- `user_id`: Foreign key to users table (nullable - allows unclaimed players)
- `avp_playerProfileId`: Identifier from AVP data for matching/updating
- `default_location_id`: Player's primary location

#### leagues
Leagues are groups of players who play together regularly. Each league has configuration settings and can have multiple seasons.

**Key Fields:**
- `is_open`: Whether the league is open to new players (1) or invite-only (0)
- `active_season_id`: Currently active season for the league
- `location_id`: Primary location of the league

#### league_configs
Configuration for each league (one-to-one relationship). Stores league-level settings such as point systems. ELO parameters (K-factor, initial ELO) are global constants applied to all ranked matches.

#### league_members
Join table linking players to leagues. Tracks membership and role (admin/member).

#### seasons
Seasons within a league. When a league is created, a season should also be created. Each season can have its own point system that overrides league config.

**Key Fields:**
- `start_date` / `end_date`: Season duration
- `is_active`: Whether the season is currently active
- `point_system`: JSON/text configuration that can override league defaults

#### player_season_stats
Season-specific player statistics. This replaces the denormalized stats in the old `players` table. Each row represents a player's stats for a specific season.

**Key Fields:**
- `current_elo`: Player's current ELO rating for this season
- `games`, `wins`, `points`: Game statistics
- Unique constraint on (player_id, season_id)

#### locations
Metropolitan areas based on player cities. Used to organize leagues, courts, and player default locations.

#### courts
Physical court locations where games are played. Each court belongs to a location and can have GeoJSON coordinates.

**Key Fields:**
- `geoJson`: GeoJSON format location data
- `location_id`: The metropolitan area this court belongs to

#### friends
Join table linking players as friends. Uses player1_id and player2_id where player1_id < player2_id to prevent duplicates.

#### sessions (updated)
Gaming sessions grouped by date/time. Now linked to seasons and courts.

**New Fields:**
- `season_id`: Foreign key to seasons (nullable for legacy sessions)
- `court_id`: Foreign key to courts (nullable)

### Existing Tables (unchanged)

#### matches
Match results between two teams. Stores player IDs, scores, date, and winner only. Player names can be resolved via `players`, and ELO deltas are tracked in `elo_history`.

#### partnership_stats
Statistics for how players perform with each partner.

#### opponent_stats
Statistics for how players perform against each opponent.

#### elo_history
Historical ELO changes over time for charting.

#### settings
Application configuration key-value store.

## Relationships Summary

1. **User ↔ Player**: One-to-one, optional (users can claim a player profile)
2. **League ↔ LeagueConfig**: One-to-one (each league has one config)
3. **League ↔ Player**: Many-to-many via `league_members`
4. **League → Season**: One-to-many (leagues have multiple seasons)
5. **League → Season**: One-to-zero-or-one (active_season_id)
6. **Season → Session**: One-to-many
7. **Season ↔ Player**: Many-to-many via `player_season_stats`
8. **Location → Court**: One-to-many
9. **Location → League**: One-to-many
10. **Location → Player**: One-to-many (via default_location_id)
11. **Court → Session**: One-to-many (optional)
12. **Player ↔ Player**: Many-to-many via `friends` (self-referential)

## Indexes

Indexes are created for:
- Foreign keys (for join performance)
- Unique constraints
- Frequently queried fields (dates, names, phone numbers)
- Composite indexes for common query patterns

## Migration Notes

- The existing `players` table data should be migrated to `player_season_stats` by creating a default season
- Legacy `sessions` will have NULL `season_id` and `court_id` values
- Players are seeded from `merged-player-ratings.json` using `avp_playerProfileId` as the stable identifier

