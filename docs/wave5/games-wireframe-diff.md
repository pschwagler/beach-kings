# Wave 5 — Games & Stats: Wireframe Diff

Documents intentional deviations from the wireframe HTML files for the Games domain
(my-games, my-stats, score-game screens).

---

## My Games (`my-games.html` vs `MyGamesScreen`)

### Implemented as specified
- Date-grouped game list with section headers
- `WIN` / `LOSS` result badge on each game row
- Score displayed as "You 21 – 19 Opp" format
- League name and game date in the meta line
- Rating change shown as `+N` / `-N`; `PENDING` badge when null
- Filter bar with All / Wins / Losses chips (`filter-result-all`, `-win`, `-loss`)
- Empty state with volleyball SVG icon, "No Games Yet" title, "Add Your First Game" CTA
- Error state with retry button

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `filter-select` league dropdown | `filter-league-active` chip (clear-only) | Simpler UX for MVP; league filter will come from upstream navigation context, not a dropdown |
| `state-switcher` toggle (all leagues / league view) | Not implemented | Deferred; API does not yet support per-league game history |
| `tab add-games` in bottom nav | Uses `routes.scoreGame()` push | Navigation is handled by the main app tab bar, not duplicated inside the screen |
| `tab-badge` on add-games tab | Not implemented | Badge counter requires pending-match count from backend (TODO) |
| `pending-note` below PENDING badge | Shown inline in `RatingChange` | Same information, more compact |

---

## My Stats (`my-stats.html` vs `MyStatsScreen`)

### Implemented as specified
- Profile header: avatar initial, name, city, level badge
- Stats bar: Games | Rating | W-L | Win Rate (4 columns)
- Trophy row: horizontal scroll, place medals using emoji characters
- Time filter chips: 30d / 90d / 1y / All Time (triggers refetch with `time` query param)
- Stats grid: 2×3 layout — Win Rate, Avg Pt Diff, Peak Rating, Record, Games Played, Rating
- Rating history chart: SVG sparkline with gradient fill area
- Breakdown table: Partners / Opponents toggle with columns Name | G | W-L | W% | +/-

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `filter-chip` league filter above stats | Not implemented | Deferred; league-scoped stats require backend filter support (TODO) |
| `chart-tooltip` on chart tap | Not shown | SVG tooltip in RN requires gesture handlers; deferred as polish |
| `chart-dot` at each timeline point | Not shown | Minimal viable chart; dots can be added when timeline density warrants |
| `show-all` button below breakdown table | Not implemented | All rows returned by API are shown; pagination deferred |
| `val` trend indicator arrows in breakdown table | `+/-` numeric column | Numeric diff is more informative than direction arrows alone |

---

## Score Game (`score-scoreboard.html` vs `ScoreGameScreen`)

### Implemented as specified
- Split scoreboard: Team 1 (teal) | divider | Team 2 (amber)
- 2 player slots per team; empty slots show dashed placeholder
- `+` / `-` stepper buttons; score cannot go below 0
- Roster picker with search input and chip grid
- Selected players highlighted with team color on their chip
- Three states: idle (scoreboard + roster), error (retry + discard), success (Done + Add Another)
- `Save Game` button disabled until all 4 slots filled and score > 0
- On success: Done → `router.back()`, Add Another → `router.replace('/')`
- On error: Retry → back to idle (preserves entered data), Discard → back to idle (preserves data)

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| `score-league.html` league-select step before scoreboard | Not implemented | Deferred; score entry is standalone for MVP; league context will be passed via `matchId` route param |
| `session-bar` at top (session number) | Not implemented | Session concept not yet in backend schema |
| `btn-delete-game` in error state | Not shown | Discard button covers this use case; delete is a separate backend concern |
| `modal-overlay` confirmation dialog on discard | Not implemented | Deferred polish; discard currently goes directly to idle |
| `board-player` remove button (`bp-remove`) | Not implemented | Tap the same slot again to reassign; explicit remove is a polish item |
| `title-add` / `title-edit` header variants | Always shows "Score Game" | Edit flow (edit existing scored game) not yet wired up |
| `state-building-block` / `state-scoring-block` visual stepper | Not implemented | Linear state (all on one screen) is simpler for MVP |
| `add-new-player` button in roster picker | Not implemented | Requires backend player creation flow; deferred |
| `score-warning` validation message | Not shown inline | Save button disabled state communicates the constraint implicitly |

---

## Notes on Backend TODOs

Several API methods used by these screens are stubs in `mockApi.ts` with `TODO(backend)` markers:

- `getMyGames()` — returns mock `MOCK_GAMES` data
- `getMyStats()` — returns mock `MOCK_STATS` data
- `submitScoredGame()` — throws `notImplemented` error (backend endpoint not yet available)

When real endpoints ship, only the API client methods need updating; screen components and hooks remain unchanged.
