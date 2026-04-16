/**
 * Season, weekly schedule, and signup types.
 */

export interface Season {
  id: number;
  league_id: number;
  name?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  signup_deadline?: string | null;
  is_active?: boolean | null;
  awards_finalized_at?: string | null;
  scoring_system?: string | null;
  point_system?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WeeklySchedule {
  id: number;
  season_id: number;
  day_of_week: number;
  start_time: string;
  duration_hours: number;
  court_id: number | null;
  open_signups_mode: string;
  open_signups_day_of_week: number | null;
  open_signups_time: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface SignupPlayer {
  player_id: number;
  player_name: string;
  signed_up_at: string;
}

export interface Signup {
  id: number;
  season_id: number;
  weekly_schedule_id: number | null;
  scheduled_datetime: string;
  duration_hours: number;
  court_id: number | null;
  open_signups_at: string | null;
  player_count: number;
  is_open: boolean;
  is_past: boolean;
  created_at: string;
  updated_at: string;
  players: SignupPlayer[] | null;
}
