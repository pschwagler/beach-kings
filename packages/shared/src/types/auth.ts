/**
 * Authentication-related types.
 */

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: number;
  phone_number: string | null;
  is_verified: boolean;
  auth_provider: string;
  profile_complete: boolean | null;
  /** True when the user has a password set; absent or false for OAuth-only accounts. */
  has_password?: boolean;
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
