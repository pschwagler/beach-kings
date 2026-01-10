// Shared TypeScript types for the Beach Kings application

export interface Player {
  id: number;
  name: string;
  gender?: 'male' | 'female';
  level?: 'beginner' | 'intermediate' | 'advanced' | 'AA' | 'Open';
  city?: string;
  email?: string;
  phone?: string;
  nickname?: string;
  age?: number;
  height?: string;
  position?: string;
  preferred_side?: string;
  default_location_id?: number;
  ELO?: number;
  Points?: number;
  game_count?: number;
  win_count?: number;
  loss_count?: number;
  win_rate?: number;
  avg_pt_diff?: number;
}

export interface Match {
  id: number;
  date: string;
  team1_player1_id: number;
  team1_player2_id: number;
  team2_player1_id: number;
  team2_player2_id: number;
  team1_score: number;
  team2_score: number;
  winner: 1 | 2;
  elo_change_team1?: number;
  elo_change_team2?: number;
  season_id?: number;
  league_id?: number;
  session_id?: number;
  location_id?: number;
  court_id?: number;
}

export interface League {
  id: number;
  name: string;
  description?: string;
  location_id?: number;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: number;
  league_id: number;
  name: string;
  start_date: string;
  end_date: string;
  point_system?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  league_id?: number;
  season_id?: number;
  date: string;
  location_id?: number;
  court_id?: number;
  is_active: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  name: string;
  city: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  region?: string;
}

export interface Court {
  id: number;
  location_id: number;
  name: string;
  address?: string;
}

export interface User {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  player_id?: number;
  is_admin?: boolean;
}

export interface PlayerOption {
  value: number | string;
  label: string;
}

export interface ApiError {
  message: string;
  detail?: string;
  status?: number;
}

