# Feature: Session & League Location Metadata

**Date:** 2026-02-19
**Updated:** 2026-02-24
**Status:** Approved
**Tracking:** [Issue #94](https://github.com/pschwagler/beach-kings/issues/94)
**Post-completion:** Delete this doc or reduce to a short summary. The issue tracks the work; this doc shouldn't linger as stale reference.

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
| `location_id` | String FK → locations.id | Yes | Auto-linked from nearest location to session lat/long |
| `latitude` | Float | Yes | From court → browser geolocation → player city |
| `longitude` | Float | Yes | From court → browser geolocation → player city |

`court_id` already exists on sessions. No new column needed.

**`leagues` table — add 3 columns:**

| Column | Type | Nullable | Source |
|--------|------|----------|--------|
| `default_court_id` | Integer FK → courts.id | Yes | Set by league admin |
| `latitude` | Float | Yes | From default_court → location hub |
| `longitude` | Float | Yes | From default_court → location hub |

`location_id` already exists on leagues. No new column needed.

### Geo Resolution

When a session is created, resolve lat/long from the best available source:

```
Priority for lat/long:
1. court_id set → use court.latitude/longitude
2. league session (season_id → season → league) with default_court_id → use court coords
3. browser geolocation provided → use those coords
4. creator's player profile → use player.city_latitude/city_longitude
5. none of the above → lat/long stay null
```

Then auto-link `location_id`:
- If lat/long resolved → `find_closest_location(lat, lng)` → set `location_id` to nearest hub
- If no lat/long → `location_id` stays null
- `location_id` is always derived from coordinates, never inherited directly

`find_closest_location()` already exists in `location_service.py`. Consider adding a max-distance threshold (e.g. 100mi) to avoid matching a session in rural Montana to a hub 500 miles away.

### Session Creation Changes

**Non-league sessions** (`POST /api/sessions`):
- Already accepts `court_id`
- Add optional `latitude`/`longitude` params (from browser geolocation)
- If court set → use court's coords (ignore browser lat/long)
- If no court but browser lat/long → use those
- Fallback → creator's player city coords
- Auto-link `location_id` from resolved lat/long

**League sessions** (via league admin routes):
- Auto-populate `court_id` from `league.default_court_id` if not overridden
- Resolve lat/long from court (or league coords if no court)
- Auto-link `location_id` from resolved lat/long

### League Updates

**League creation / settings:**
- Add `default_court_id` field to league create/update schemas
- When `default_court_id` changes → update league lat/long from court
- When `default_court_id` is null → fall back to location hub coords
- UX: dropdown of courts filtered by the league's `location_id`

### Backfill Strategy

All existing sessions were played at **QBK Sports** (Queens, `court_id` TBD from DB). Backfill is simple:

```sql
-- Set all existing sessions to QBK court
UPDATE sessions
SET court_id = <qbk_court_id>,
    location_id = 'ny_nyc',
    latitude = 40.7471,
    longitude = -73.9256
WHERE court_id IS NULL OR location_id IS NULL;
```

Columns stay nullable — future sessions without any geo data will have NULLs.

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

Use query-time aggregation for now. Cache/materialize when scale demands it.

### Frontend: Court Picker on Session Creation

When creating a non-league session:
1. Request browser geolocation (optional, user can deny)
2. If granted → show nearby courts sorted by distance
3. User picks a court or skips ("no specific court")
4. Selected court flows into session creation payload
5. If no court selected but geolocation available → send lat/long as fallback

Sessions can be created without a court — location still resolves from geo fallbacks.

### Indexes

```sql
CREATE INDEX idx_sessions_location ON sessions (location_id);
CREATE INDEX idx_sessions_lat_lng ON sessions (latitude, longitude);
CREATE INDEX idx_leagues_default_court ON leagues (default_court_id);
```

## Tasks

### Phase 1: Data Foundation

1. **Migration: add columns to sessions table** — `location_id` (FK), `latitude`, `longitude` (all nullable)
2. **Migration: add columns to leagues table** — `default_court_id` (FK), `latitude`, `longitude` (all nullable)
3. **Add indexes** — `idx_sessions_location`, `idx_sessions_lat_lng`, `idx_leagues_default_court`
4. **Backfill existing sessions** — Set all to QBK court + `ny_nyc` location + QBK coords
5. **Add `resolve_session_geo()` helper** — Implements the geo resolution chain (court → league → browser → player city → null), calls `find_closest_location()` to auto-link `location_id`
6. **Wire geo resolution into session creation** — Non-league sessions: call `resolve_session_geo()` on create. Accept optional `latitude`/`longitude` params in session create schema.
7. **Wire geo resolution into league session creation** — League sessions: inherit `court_id` from `league.default_court_id` if not overridden, then resolve geo.
8. **Add `default_court_id` to league create/update** — Schema changes, route changes, update league lat/long when court changes.
9. **Update docs** — `DATABASE_SCHEMA.md`, `API_ROUTES.md` for new fields/params.
10. **Tests** — Unit tests for `resolve_session_geo()`, test session creation with various geo inputs, test league default court propagation.

### Phase 2: Location Leaderboard

11. **New location leaderboard query** — Join Match → Session (where `session.location_id = X`) → aggregate wins/losses/rating by player. Query-time for now.
12. **Update `public_service.py`** — Replace `Player.location_id` filter with session-based match aggregation.
13. **Update public location page frontend** — Ensure it renders correctly with new data shape (if response schema changes).
14. **Tests** — Verify leaderboard shows players who *play* at a location, not just *live* there.

### Phase 3: Frontend Court Picker

15. **Browser geolocation hook** — `useGeolocation()` React hook, request permission on session creation.
16. **Nearby courts API** — Endpoint or query param to sort courts by distance from given lat/long.
17. **Court picker component** — Show nearby courts on session creation, allow select/skip.
18. **Send lat/long on session create** — If no court selected but geolocation available, include coords in payload.
19. **League settings: default court picker** — Dropdown of courts filtered by league's `location_id`.

### Phase 4: Discovery Features (future)

20. "Recent matches nearby" feed
21. "Top courts your friends play at"
22. Court-level per-player stats
23. Activity indicators on court/location pages

## Resolved Questions

1. **Should `location_id` on session be required?** No. Nullable at DB level, best-effort in app code. Always resolved from coordinates when available.
2. **Per-location stats table vs query-time?** Query-time for now. Cache/materialize when performance requires it.
3. **League home court UX?** Dropdown of courts filtered by league's `location_id` in league settings.
4. **Backfill accuracy?** All existing sessions → QBK Sports. This is accurate since QBK is the only court in use.
5. **Court picker priority?** Not a blocker. Sessions can be created without courts. Court picker is Phase 3.
