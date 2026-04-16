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
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
