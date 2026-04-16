/**
 * League-related types.
 */

import type { LeagueGender, LeagueMemberRole, SkillLevel } from './enums';

export interface LeagueMember {
  id: number;
  league_id: number;
  player_id: number;
  /** Role within the league. Comes from joined queries, not the Player object. */
  role: LeagueMemberRole;
  created_at: string;
  /** player_name comes from joined queries (not on the base Player object). */
  player_name?: string | null;
  is_placeholder?: boolean | null;
}

export interface HomeCourtResponse {
  id: number;
  name: string;
  address: string | null;
  position: number;
}

export interface LeagueStandingRow {
  player_id: number;
  name: string;
  elo: number;
  points: number;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pt_diff: number;
  season_rank?: number;
  initials?: string;
  is_placeholder?: boolean;
}

export interface LeagueMatchRow {
  id: number;
  date: string | null;
  session_id: number | null;
  session_name: string | null;
  session_status: string | null;
  session_season_id: number | null;
  team1_player1_id: number | null;
  team1_player1_name: string | null;
  team1_player2_id: number | null;
  team1_player2_name: string | null;
  team2_player1_id: number | null;
  team2_player1_name: string | null;
  team2_player2_id: number | null;
  team2_player2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner: number | null;
  is_ranked: boolean | null;
  ranked_intent: boolean | null;
  elo_changes: Record<string, { elo_before?: number; elo_after: number; elo_change: number }>;
}

export interface League {
  id: number;
  name: string;
  gender?: LeagueGender | null;
  level?: SkillLevel | null;
  location_id?: string | null;
  location_name?: string | null;
  region_name?: string | null;
  description?: string | null;
  is_open?: boolean | null;
  is_public?: boolean | null;
  member_count?: number | null;
  games_played?: number | null;
  created_at?: string;
  standings?: LeagueStandingRow[] | null;
  recent_matches?: LeagueMatchRow[] | null;
  members?: LeagueMember[] | null;
  home_courts?: HomeCourtResponse[] | null;
  current_season?: { name?: string | null } | null;
}
