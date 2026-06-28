# Player Privacy — Phase 2 (real enforcement)

Phase 1 (shipped) made the **public player profile** honor the privacy model
on mobile. Phase 2 propagates the same flag to the remaining surfaces that
expose a player's personal record, and moves enforcement server-side so it is
real (not just presentational).

## The model (recap)

One flag: **`show_game_history`** (user setting, default on).

When a player turns it **off**, hide ONLY their:

- win-loss record (`total_wins` / losses)
- win rate (`win_rate`)
- point differential (`avg_point_diff`, "+/-")

Always stays visible: **rating/ELO, games count, rank, league-standings
position, identity** (name/avatar/city/level), league memberships.

Rules:

- **Self always sees their own full stats.**
- **No relationship exemptions** — gating is static (self vs. everyone-else),
  so it needs no per-viewer computation and public endpoints stay cacheable.
- **Standings, rankings, and leaderboards are NOT gated** — a private player
  still appears there normally. Privacy applies to *personal-record* surfaces.

## The contract

Every player-bearing payload that shows a personal record carries:

```
game_history_visible: boolean   // false => W-L / win% / +/- are nulled
```

The mobile client already honors this end-to-end:

- `mapPublicPlayerToPlayer` (`packages/api-client/src/methods.ts`) nulls
  `wins` / `losses` / `win_rate` when `game_history_visible === false`, keeping
  `current_rating` and `total_games`.
- `<PrivateStat>` (`apps/mobile/.../PlayerProfile/PlayerStatsGrid.tsx`) renders
  a lock placeholder in the hidden tiles. Reuse this primitive on new surfaces.

So Phase 2 is mostly **backend**: attach `game_history_visible` to the
in-scope payloads and null the three fields server-side when the viewed player
hid them and the viewer is not the owner.

## Why server-side

Client gating is presentation only — the data still ships in the response and
the public endpoints are unauthenticated. Real enforcement = the server never
puts the hidden numbers in the payload. Phase 1 deliberately did the profile
first; Phase 2 closes the rest.

## In-scope surfaces (remaining leaks)

Ordered by exposure. See the session audit for full file:line references.

1. **League Stats tab** — `GET /api/leagues/{leagueId}/players/{playerId}/stats`
   → `data_service.get_league_player_stats_full`. The biggest leak: full W-L,
   win%, point-diff, per-partner and per-opponent breakdowns, and game-by-game
   history, none gated. Mobile: `LeagueStatsTab.tsx`.
2. **Player match / stats endpoints** — `GET /api/players/{id}/matches`,
   `GET /api/players/{id}/stats`, and the season/league-scoped variants. Only
   called for self today, but the endpoints accept any id and are ungated.
3. **Court & location leaderboards** — `GET /api/public/courts/{slug}/leaderboard`,
   `GET /api/public/locations/{slug}`. These show `win_count` / `win_rate` /
   `total_wins`. Decide: treat as "leaderboard" (exempt, like rankings) or gate
   the win fields. Recommendation: exempt position/ELO, gate win-rate.

## Explicitly out of scope

- **Standings / rankings / `/api/rankings`** — product decision: not gated.
- **Discover / find-players `games_played`** — a games *count*, not in the hide
  list; leave visible.
- **`profile_is_private`** — deferred. The DB column and API field remain; the
  mobile UI toggle was removed (re-add it + wire enforcement when this feature
  is picked up). It would gate identity/social, and would need the per-viewer
  relationship logic that Phase 2's stat-gating intentionally avoids.

## Done when

- The in-scope endpoints null W-L / win% / +/- for players who hid their game
  history (viewer ≠ owner), and carry `game_history_visible`.
- `LeagueStatsTab` renders `<PrivateStat>` for the hidden fields.
- Backend tests assert the gating per endpoint; mobile tests cover the hidden
  rendering.
