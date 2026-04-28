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
 * Response shape from `GET /api/auth/me` — backend `UserResponse`.
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
