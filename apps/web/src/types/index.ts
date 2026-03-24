/**
 * Lightweight domain interfaces for Beach Kings.
 * These are intentionally minimal — use `any` for fields that vary by endpoint.
 * Do not import backend schema types here; keep this file self-contained.
 */

export interface User {
  id: number;
  phone: string;
  created_at?: string;
  player?: Player;
}

export interface Player {
  id: number;
  name: string;
  gender?: string | null;
  level?: string | null;
  city?: string | null;
  state?: string | null;
  avatar?: string | null;
  location_id?: string | null;
  [key: string]: any;
}

export interface League {
  id: number;
  name: string;
  gender?: string | null;
  level?: string | null;
  location_id?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface Season {
  id: number;
  league_id: number;
  name?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  [key: string]: any;
}

export interface Session {
  id: number;
  season_id: number;
  date?: string | null;
  status?: string | null;
  [key: string]: any;
}

export interface Match {
  id: number;
  session_id: number;
  team1_score?: number | null;
  team2_score?: number | null;
  [key: string]: any;
}

export interface Court {
  id: number;
  name: string;
  surface?: string | null;
  city?: string | null;
  state?: string | null;
  [key: string]: any;
}

export interface Location {
  id: string;
  city: string;
  state: string;
  region?: string | null;
  [key: string]: any;
}
