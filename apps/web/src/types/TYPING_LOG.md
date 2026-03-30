# TypeScript Typing Quality Log

Issues where types exist but the format, naming, or structure should be improved.

---

## 1. Space-Keyed Fields (Critical)

The backend uses Pydantic `Field(alias="Team 1 Player 1")` to produce display-friendly JSON keys with spaces. 10+ frontend files consume these via bracket access (`match['Team 1 Player 1']`). This is a code smell — keys with spaces force bracket notation, defeat autocomplete, and prevent destructuring.

**Origin**: `apps/backend/models/schemas.py` lines 69-98 (MatchResponse, PlayerMatchHistoryResponse), `apps/backend/services/stats_read_data.py` lines 194-204 (rankings)

**Affected keys**:
- Match: `'Team 1 Player 1'`, `'Team 1 Player 2'`, `'Team 2 Player 1'`, `'Team 2 Player 2'`, `'Team 1 Score'`, `'Team 2 Score'`, `'Is Ranked'`, `'Ranked Intent'`
- Match history: `'Partner ID'`, `'Partner IsPlaceholder'`, `'Session ID'`, `'Session Status'`, `'Session Name'`, `'Session Code'`, `'Season ID'`, `'League ID'`, `'League Name'`, `'Court Name'`
- Rankings: `'Player ID'`, `'ELO'`, `'Points'`, `'Games'`, `'Wins'`, `'Losses'`, `'Win Rate'`, `'Avg Pt Diff'`
- Partnerships: `'Partner/Opponent'`

**Frontend consumers** (10+ files): `MatchCard.tsx`, `MatchesTable.tsx`, `AddMatchModal.tsx`, `SessionMatchesClipboardTable.tsx`, `MatchHistoryTable.tsx`, `HomeTab.tsx`, `HomePage.tsx`, `MyStatsTab.tsx`, `MyMatchesWidget.tsx`, `RankingsTable.tsx`, `PlayerStatsTable.tsx`, `playerUtils.ts`, `useSessionEditing.ts`, `useSessionSeasonUpdate.ts`, `matchUtils.ts`

**Recommendation**: Change backend Pydantic aliases to snake_case (breaking API change), OR add a frontend transform layer that maps space keys to snake_case on fetch.

---

## 2. Inconsistent Naming (High)

### Player name: `name` vs `full_name` vs `player_name`
- `Player` has BOTH `name: string` AND `full_name?: string | null` — which is canonical?
- `Friend` uses `full_name`
- `LeagueMember` uses `player_name`
- `KobPlayer`/`KobStanding` use `player_name`
- `SeasonAward` uses `player_name`
- `PublicPlayerResponse` uses `full_name`

### Avatar: `avatar` vs `profile_picture_url` vs `player_avatar`
- `Player` has BOTH `avatar` AND `profile_picture_url` — same image, two fields
- `SeasonAward` has BOTH `player_avatar` AND `player_profile_picture_url`
- `Friend` uses `avatar`
- `KobPlayer`/`KobStanding` use `player_avatar`

### Player identity: `id` vs `player_id`
- `Player` has BOTH `id: number` AND `player_id?: number | null`
- `Friend` uses `player_id` (not `id`)
- `LeagueMember` uses `player_id`

**Recommendation**: Pick one canonical name per concept and alias the rest. For the backend, `full_name` should be canonical (it's what the DB column is called). `profile_picture_url` is the DB column; `avatar` is a computed field that defaults to initials.

---

## 3. String Fields That Should Be Unions (High)

| Interface | Field | Should be |
|-----------|-------|-----------|
| `Player` | `gender` | `'M' \| 'F' \| 'Co-ed'` |
| `Player` | `level` | `'B' \| 'BB' \| 'BBB' \| 'A' \| 'AA' \| 'AAA' \| 'Open'` |
| `League` | `gender`, `level` | same as Player |
| `LeagueMember` | `role` | `'admin' \| 'member'` |
| `Session` | `status` | `'ACTIVE' \| 'SUBMITTED' \| 'EDITED'` |
| `Court` | `status` | `'active' \| 'pending' \| 'rejected'` |
| `Match` | `ranked_intent` | `boolean \| null` (currently typed `string \| boolean \| null` — mixed) |
| `KobTournament` | `format` | Has union but also `\| string` which defeats it |

---

## 4. Duplicate Type Definitions (High)

Same interface defined in multiple files with diverging shapes:

| Type | Canonical (`types/index.ts`) | Duplicates |
|------|------------------------------|------------|
| `DisplayMatch` | Not in index.ts | `matchUtils.ts:37`, `useSessionEditing.ts:6`, `useEditBuffer.ts:31` — 3 different shapes |
| `CourtPhoto` | `types/index.ts:146` | `CourtEditRow.tsx:57` (missing fields), `CourtPhotoGallery.tsx:13` (id optional) |
| `CourtReview` | `types/index.ts:153` | `CourtEditRow.tsx:66` (minimal stub), `CourtReviewSection.tsx:10` (extra fields from Court) |
| `KobMatch` | `types/index.ts:468` | `KobPreview.tsx:37` (completely different shape), `NowPlayingTab.tsx:7` |
| `LeagueMember` | `types/index.ts:222` | `AddPlayersModal.tsx:30`, `usePlayerDetailsDrawer.ts:38`, `LeagueMembersModal.tsx:12` |
| `SignupPlayer` | `types/index.ts:375` | `SignupList.tsx:7`, `SignupPlayersListModal.tsx:25` |
| `Court` | `types/index.ts` | `ActiveSessionPanel.tsx:6`, `useHomeCourts.ts:18` (has `[key: string]: any`!) |
| `League` | `types/index.ts` | `LeaguesMenu.tsx:7` (local stub) |
| `Session` | `types/index.ts` | `MatchesTable.tsx:73` (local stub) |

**Recommendation**: Delete all local stubs, import from `types/index.ts`. Extend with `interface LocalType extends Type { extraField: string }` when needed.

---

## 5. `unknown[]` Fields with Known Shapes (Medium)

| Interface | Field | Known shape |
|-----------|-------|-------------|
| `Player` | `league_memberships` | `Array<{ league_id: number; league_name: string }>` |
| `League` | `standings` | `Array<{ player_id, player_name, rank, wins, losses, points, win_rate }>` |
| `League` | `recent_matches` | `Array<{ id, date, team1/2_player1/2_name, team1/2_score }>` |
| `Match` | `game_scores` | `Array<{ team1_score: number; team2_score: number }>` |
| `Court` | `tags` | `Array<{ id: number; name: string; category: string \| null }>` |

---

## 6. Response Envelope Inconsistency (Medium)

| Endpoint | Items key | Total key |
|----------|-----------|-----------|
| Leagues, Friends | `items` | `total_count` |
| Players | `items` | `total` (not `total_count`) |
| Notifications | `notifications` | `total_count` |
| Conversations | `conversations` | `total_count` |
| Messages | `messages` | `total_count` |
| Courts, Rankings | bare array | none |

**Recommendation**: Standardize backend to always use `{ items, total_count, page, page_size }`. Use `PaginatedResponse<T>` generic on frontend.

---

## 7. Minor Issues

- `KobTournament.format` has `| string` suffix that makes the literal union a no-op
- `useHomeCourts.ts` local Court stub has `[key: string]: any` escape hatch
- `CourtReviewSection.tsx` local CourtReview adds `average_rating`/`review_count` that belong on Court, not on individual reviews
- Date fields are consistently strings (good) but `DirectMessageResponse` in Pydantic uses `datetime` objects (inconsistent with other schemas, though FastAPI serializes them the same way)
