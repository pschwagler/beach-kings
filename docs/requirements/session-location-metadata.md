# Feature: Session & League Location Metadata

**Date:** 2026-02-19
**Status:** Draft

## Problem

The location leaderboard (`public_service.py`) filters players by `Player.location_id` — their self-declared home location. A player who lives in Denver but plays all their matches in NYC shows up on Denver's leaderboard, not NYC's. This is wrong.

Sessions already have an optional `court_id`, but:
- League sessions don't populate it
- There's no `location_id` on sessions for hub-level aggregation
- There's no lat/long on sessions for proximity queries
- Leagues have no concept of a "home court"
- No per-location stats exist

## Goal

Every session stores **where it happened** — court, location hub, and coordinates. This enables court/location/region leaderboards, "nearby" discovery, and map features.

## Design

### New Fields

**`sessions` table — add 3 columns:**

| Column | Type | Nullable | Source |
|--------|------|----------|--------|
| `location_id` | String FK → locations.id | Yes | Resolved from court → league → creator |
| `latitude` | Float | Yes | Resolved from court → geolocation → player |
| `longitude` | Float | Yes | Resolved from court → geolocation → player |

`court_id` already exists on sessions. No new column needed.

**`leagues` table — add 3 columns:**

| Column | Type | Nullable | Source |
|--------|------|----------|--------|
| `default_court_id` | Integer FK → courts.id | Yes | Set by league admin |
| `latitude` | Float | Yes | From default_court → location hub |
| `longitude` | Float | Yes | From default_court → location hub |

`location_id` already exists on leagues. No new column needed.

### Resolution Chain

When a session is created, resolve its geo fields in priority order:

```
1. Session has court_id set?
   → location_id = court.location_id
   → lat/long = court.latitude/longitude

2. Session is in a league (season_id → season → league)?
   → court_id = league.default_court_id (if set, and session court_id is null)
   → location_id = league.location_id
   → lat/long = league.latitude/longitude

3. Fallback to creator's player profile:
   → location_id = player.location_id
   → lat/long = player.city_latitude/city_longitude
```

Each field resolves independently. A session could have court lat/long but league location_id if the court somehow has no location (unlikely but safe).

### Session Creation Changes

**Non-league sessions** (`POST /api/sessions`):
- Already accepts `court_id`
- Add optional `latitude`/`longitude` params (from browser geolocation)
- Resolve `location_id` from court → creator's player
- If browser lat/long provided and no court → store those coords
- If court set → use court's coords (ignore browser lat/long)

**League sessions** (via league admin routes):
- Auto-populate `court_id` from `league.default_court_id` if not overridden
- Auto-populate `location_id` from league
- Auto-populate lat/long from league (or court if court set)

### League Updates

**League creation / settings:**
- Add `default_court_id` field to league create/update schemas
- When `default_court_id` changes → update league lat/long from court
- When `default_court_id` is null → fall back to location hub coords

### Frontend: Court Picker on Session Creation

When creating a non-league session:
1. Request browser geolocation (optional, user can deny)
2. If granted → show nearby courts sorted by distance
3. User picks a court or skips ("no specific court")
4. Selected court flows into session creation payload
5. If no court selected but geolocation available → send lat/long as fallback

This is a UX enhancement, not a blocker. Sessions can be created without a court — location_id still resolves from the creator's profile.

### Backfill Strategy

Existing sessions need location metadata. Migration should:

1. Add columns as nullable
2. Run a data backfill:
   - Sessions with `court_id` → resolve from court
   - League sessions without court → resolve from `league.location_id` + location lat/long
   - Remaining → resolve from `created_by` player's location
3. **Do NOT make columns NOT NULL** — some old sessions may have creators with no location

```sql
-- Pseudocode for backfill
UPDATE sessions s
SET location_id = c.location_id,
    latitude = c.latitude,
    longitude = c.longitude
FROM courts c WHERE s.court_id = c.id;

UPDATE sessions s
SET location_id = COALESCE(s.location_id, l.location_id),
    latitude = COALESCE(s.latitude, loc.latitude),
    longitude = COALESCE(s.longitude, loc.longitude)
FROM seasons sea
JOIN leagues l ON sea.league_id = l.id
LEFT JOIN locations loc ON l.location_id = loc.id
WHERE s.season_id = sea.id;

UPDATE sessions s
SET location_id = COALESCE(s.location_id, p.location_id),
    latitude = COALESCE(s.latitude, p.city_latitude),
    longitude = COALESCE(s.longitude, p.city_longitude)
FROM players p WHERE s.created_by = p.id;
```

### Location Leaderboard Fix

**Current** (`public_service.py`):
```python
# Filters by player home location — WRONG
query = select(Player, PlayerGlobalStats).where(Player.location_id == location.id)
```

**New**: Query matches through sessions at that location:
```python
# Matches played at this location
# Join: Match → Session (where session.location_id = X) → aggregate by player
```

This is a bigger change — needs a new query or a `player_location_stats` materialized view. Can be Phase 2 if needed; Phase 1 is getting the data onto sessions.

### Indexes

```sql
CREATE INDEX idx_sessions_location ON sessions (location_id);
CREATE INDEX idx_sessions_lat_lng ON sessions (latitude, longitude);
CREATE INDEX idx_leagues_default_court ON leagues (default_court_id);
```

## Phases

### Phase 1: Data Foundation
- Migration: add columns to sessions + leagues
- Backfill existing sessions
- Update session creation to resolve geo fields
- Add `default_court_id` to league create/update
- Add indexes

### Phase 2: Location Leaderboard
- New query: aggregate player stats from matches at sessions in a location
- Consider `player_location_stats` table (calculated, like global stats) vs query-time aggregation
- Update public location page to use match-based leaderboard

### Phase 3: Frontend Court Picker
- Geolocation prompt on session creation
- Nearby court suggestions
- Court selection / deselection UX
- League settings: default court picker

### Phase 4: Discovery Features
- "Recent matches nearby" feed
- "Top courts your friends play at"
- Court-level per-player stats
- Activity indicators on court/location pages

## Open Questions

1. **Should `location_id` on session be required going forward?** Every session should resolve to _somewhere_, but do we enforce at DB level or just best-effort?
2. **Per-location stats table vs query-time?** A `player_location_stats` table is fast to read but needs recalculation. Query-time is simpler but slower for large datasets.
3. **League home court UX** — where in the league settings UI does this go? Is it a dropdown of courts in the league's location?
4. **Backfill accuracy** — for old league sessions, using league.location_id is reasonable. For old non-league sessions with no court, creator's location is the best guess. Is that acceptable?
5. **Court picker priority** — is this a Phase 1 must-have or can sessions continue to be created without courts for now?
