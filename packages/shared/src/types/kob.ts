/**
 * King of the Beach (KOB) tournament types.
 */

import type { KobTournamentFormat, KobTournamentStatus, LeagueGender } from './enums';

export interface KobTournament {
  id: number;
  name: string;
  code: string;
  gender: LeagueGender;
  format: KobTournamentFormat;
  status: KobTournamentStatus;
  num_courts: number;
  game_to: number;
  scheduled_date: string | null;
  player_count: number;
  current_round: number | null;
  created_at: string | null;
}

export interface KobPlayer {
  id: number;
  player_id: number;
  player_name: string | null;
  player_avatar: string | null;
  seed: number | null;
  pool_id: number | null;
  is_dropped: boolean;
  dropped_at_round: number | null;
}

export interface KobMatch {
  id: number;
  matchup_id: string;
  round_num: number;
  phase: string;
  pool_id: number | null;
  court_num: number | null;
  team1_player1_id: number | null;
  team1_player2_id: number | null;
  team2_player1_id: number | null;
  team2_player2_id: number | null;
  team1_player1_name: string | null;
  team1_player2_name: string | null;
  team2_player1_name: string | null;
  team2_player2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner: number | null;
  game_scores: Array<{ team1_score: number; team2_score: number }> | null;
  bracket_position: string | null;
  is_bye: boolean;
}

export interface KobStanding {
  player_id: number;
  player_name: string | null;
  player_avatar: string | null;
  rank: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  pool_id: number | null;
}

export interface KobTournamentDetail extends KobTournament {
  win_by: number;
  max_rounds: number | null;
  has_playoffs: boolean;
  playoff_size: number | null;
  num_pools: number | null;
  games_per_match: number;
  num_rr_cycles: number;
  score_cap: number | null;
  playoff_format: string | null;
  playoff_game_to: number | null;
  playoff_games_per_match: number | null;
  playoff_score_cap: number | null;
  is_ranked: boolean;
  current_phase: string | null;
  auto_advance: boolean;
  director_player_id: number | null;
  director_name: string | null;
  league_id: number | null;
  location_id: string | null;
  schedule_data: { pools?: Record<string, unknown> | null; [key: string]: unknown } | null;
  players: KobPlayer[];
  matches: KobMatch[];
  standings: KobStanding[];
  updated_at: string | null;
}
