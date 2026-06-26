/**
 * Authentication-related types.
 */

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: number;
  phone_number: string | null;
  email?: string | null;
  is_verified: boolean;
  auth_provider: string;
  profile_complete: boolean | null;
  is_new_user?: boolean;
  /** True when the user has a password set; absent or false for OAuth-only accounts. */
  has_password?: boolean;
}

/**
 * Response shape from `GET /api/auth/me`, `POST /api/auth/google/add`, and
 * `POST /api/auth/apple/add` — backend `UserResponse`.
 * Distinct from `AuthResponse` (which is the login/refresh-token envelope).
 */
export interface UserMeResponse {
  id: number;
  phone_number: string | null;
  email: string | null;
  is_verified: boolean;
  auth_provider: string;
  has_password: boolean;
  deletion_scheduled_at: string | null;
  created_at: string;
  /** Whether the user has a Google account linked. */
  google_connected: boolean;
  /** Whether the user has an Apple account linked. */
  apple_connected: boolean;
  /** Whether the user's profile is hidden from public discovery. */
  profile_is_private: boolean;
  /** Whether the user's game history is visible to others. */
  show_game_history: boolean;
}

/** Generic status/message response (e.g. account deletion endpoints). */
export interface StatusResponse {
  status: string;
  message?: string | null;
}

/** Request body for `POST /api/users/me` (profile privacy update, etc.). */
export interface UserUpdateRequest {
  email?: string | null;
  profile_is_private?: boolean;
  show_game_history?: boolean;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  status: string;
  password_changed_at: string;
}
