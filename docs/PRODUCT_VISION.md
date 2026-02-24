# Beach League — Product Vision

## Mission

Make the beach volleyball community more connected and discoverable. Every match, court, league, and player should be part of a connected graph that helps players find games, track progress, and discover their local scene.

Grow the game of beach volleyball. Be able to travel to a new city, see players with similar ratings, find pick up matches and courts to play at, connect with the community.

Watch live AVP events, find tournaments nearby, and generally get people excited about what's going on in their communities.

## Core Pillars

### 1. Play Tracking
Every match is recorded with who played, the score, and **where it happened**. This data feeds everything else — stats, leaderboards, court activity, player profiles.

### 2. Geographic Discovery
The app is organized around a geographic hierarchy:

```
Region (California, Northeast, Hawaii...)
  └── Location hub (San Diego, LA, NYC...)
        └── Court (OB Courts, Manhattan Beach Pier...)
              └── Session → Matches
```

Every piece of content — leagues, sessions, matches, players — connects to this hierarchy. Users can explore at any level:
- **Region page**: All locations, top players, active leagues
- **Location page**: Courts, leaderboards, leagues, recent activity
- **Court page**: Leaderboard, reviews, photos, upcoming sessions

### 3. Competitive Identity
Players build a profile through play: ELO rating, win rate, match history, partnerships, rival matchups. Stats are scoped to where you play — your San Diego stats can be separate from your NYC stats when viewed at specific location-based leaderboards.

### 4. Community & Social
Friends, mutual connections, league membership, shared match history. "Top courts your friends play at", "matches near you this week", player suggestions based on location and level.

---

## Geographic Data Philosophy

**Every ranked match should be attributable to a place.** This is foundational — it enables:

| Feature | Requires |
|---------|----------|
| Court leaderboard | Match → Session → Court |
| Location leaderboard | Match → Session → Location |
| Region leaderboard | Match → Session → Location → Region |
| "Recent matches nearby" | Session lat/long |
| "Top courts your friends play at" | Friends → Matches → Sessions → Courts |
| Heat maps / activity maps | Session lat/long |
| Court recommendations | Player match history → Courts |
| "Players who play here" | Matches at court → Players |
| Cross-location discovery | Session lat/long + location hierarchy |

Sessions and leagues store **both** a resolved `location_id` (for fast hub-level aggregation) **and** `latitude`/`longitude` (for proximity queries and future map features). Courts are the primary geographic anchor; coordinates and location_id are derived from the court when one is set.

---

## Feature Roadmap (High-Level)

### Future
- Region pages with aggregated stats and activity
- "Top courts your friends play at"
- Activity feed: "3 matches played at OB Courts today"
- Court-level stats per player ("your record at this court")
- Map view of sessions/courts with activity indicators
- Player recommendations by location + level
- Tournament/event support tied to courts
- Seasonal trends by location (activity by month)
- See what's going on in your area - pickup matches, live events

---

## Principles

1. **Data first, UI second.** Get the right data into the right tables. UI features follow naturally.
2. **Location is not optional.** Every ranked match should resolve to a location. Fallback chains ensure coverage.
3. **Don't over-index on precision.** A match at "somewhere in San Diego" is better than a match with no location. The fallback chain (court → league → player) trades precision for coverage.
4. **Build for aggregation.** Store denormalized location_id on sessions for fast queries. Don't force joins through 4 tables for every leaderboard query.
5. **Progressive enhancement.** Lat/long enables advanced proximity features over time.
