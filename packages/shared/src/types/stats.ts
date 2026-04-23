/**
 * Types for the My Stats screen payload (GET /api/users/me/stats).
 *
 * Mirror the Python Pydantic schemas in apps/backend/models/schemas.py.
 * Shape-contract tests in the backend test suite enforce that these two
 * stay in sync.
 */

export interface EloTimelinePoint {
  readonly date: string;
  readonly rating: number;
}

export interface MyStatsOverall {
  readonly wins: number;
  readonly losses: number;
  readonly games_played: number;
  readonly rating: number;
  readonly peak_rating: number;
  readonly win_rate: number;
  readonly current_streak: number;
  readonly avg_point_diff: number;
}

export interface MyStatsTrophy {
  readonly league_id: number;
  readonly league_name: string;
  readonly season_name: string;
  readonly place: number;
}

/** Stats row for a single partner or opponent relationship. No rating_diff. */
export interface MyStatsRelationStat {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly games_played: number;
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
}

export interface MyStatsPayload {
  readonly player_name: string;
  readonly player_city: string | null;
  readonly player_level: string | null;
  readonly overall: MyStatsOverall;
  readonly trophies: readonly MyStatsTrophy[];
  readonly partners: readonly MyStatsRelationStat[];
  readonly opponents: readonly MyStatsRelationStat[];
  readonly elo_timeline: readonly EloTimelinePoint[];
}
