/** A session participant as displayed in the session players UI. */
export interface SessionParticipant {
  player_id: number;
  full_name?: string | null;
  player_name?: string | null;
  gender?: string | null;
  level?: string | null;
  location_name?: string | null;
  is_placeholder?: boolean;
}
