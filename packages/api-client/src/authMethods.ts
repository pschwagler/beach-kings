import type { AxiosInstance } from "axios";
import type {
  AuthResponse,
  UserMeResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
} from "@beach-kings/shared";

export function createAuthMethods(api: AxiosInstance) {
  return {
    /**
     * Password login — accepts phone_number OR email (not both).
     */
    async login(credentials: {
      phone_number?: string;
      email?: string;
      password: string;
    }): Promise<AuthResponse> {
      const response = await api.post<AuthResponse>('/api/auth/login', credentials);
      return response.data;
    },

    /**
     * Register a new user. Requires EITHER phone_number OR email plus password.
     * first_name + last_name preferred; falls back to full_name splitting.
     */
    async signup(data: {
      phone_number?: string;
      email?: string;
      password: string;
      first_name?: string;
      last_name?: string;
      full_name?: string;
    }): Promise<AuthResponse> {
      const response = await api.post<AuthResponse>('/api/auth/signup', data);
      return response.data;
    },

    async logout(): Promise<{ status: string }> {
      const response = await api.post<{ status: string }>('/api/auth/logout');
      return response.data;
    },

    /**
     * Exchange a Google ID token for Beach League auth tokens.
     */
    async googleAuth(idToken: string): Promise<AuthResponse> {
      const response = await api.post<AuthResponse>('/api/auth/google', { id_token: idToken });
      return response.data;
    },

    /**
     * Exchange an Apple ID token for Beach League auth tokens.
     */
    async appleAuth(idToken: string): Promise<AuthResponse> {
      const response = await api.post<AuthResponse>('/api/auth/apple', { id_token: idToken });
      return response.data;
    },

    /**
     * Link a Google account to the currently authenticated user.
     *
     * Fails if the Google account is already linked to a different Beach League
     * user. Returns the updated user record with `google_connected: true`.
     *
     * Maps to POST /api/auth/google/add.
     */
    async linkGoogle(idToken: string): Promise<UserMeResponse> {
      const response = await api.post<UserMeResponse>('/api/auth/google/add', { id_token: idToken });
      return response.data;
    },

    /**
     * Link an Apple account to the currently authenticated user.
     *
     * Fails if the Apple account is already linked to a different Beach League
     * user. Returns the updated user record with `apple_connected: true`.
     *
     * Maps to POST /api/auth/apple/add.
     */
    async linkApple(idToken: string): Promise<UserMeResponse> {
      const response = await api.post<UserMeResponse>('/api/auth/apple/add', { id_token: idToken });
      return response.data;
    },

    /**
     * Send SMS verification code to the given phone number.
     */
    async sendVerification(phoneNumber: string) {
      const response = await api.post('/api/auth/send-verification', {
        phone_number: phoneNumber,
      });
      return response.data;
    },

    /**
     * Verify phone number with the 6-digit OTP code.
     */
    async verifyPhone(phoneNumber: string, code: string) {
      const response = await api.post('/api/auth/verify-phone', {
        phone_number: phoneNumber,
        code,
      });
      return response.data;
    },

    /**
     * Request a one-time OTP to attach a phone number to the signed-in account.
     * User must have no phone on file; phone changes are handled via support.
     */
    async requestAddPhone(phoneNumber: string): Promise<{ status: string }> {
      const response = await api.post('/api/auth/phone/add/request', {
        phone_number: phoneNumber,
      });
      return response.data;
    },

    /**
     * Verify the add-phone OTP and attach the phone to the current user.
     * Returns the updated /me-shaped user.
     */
    async verifyAddPhone(phoneNumber: string, code: string) {
      const response = await api.post('/api/auth/phone/add/verify', {
        phone_number: phoneNumber,
        code,
      });
      return response.data;
    },

    /**
     * Verify email with the 6-digit OTP code.
     */
    async verifyEmail(email: string, code: string) {
      const response = await api.post('/api/auth/verify-email', {
        email,
        code,
      });
      return response.data;
    },

    /**
     * Passwordless SMS login — send code first via sendVerification().
     */
    async smsLogin(phoneNumber: string, code: string) {
      const response = await api.post('/api/auth/sms-login', {
        phone_number: phoneNumber,
        code,
      });
      return response.data;
    },

    /**
     * Check whether a phone number is already registered.
     */
    async checkPhone(phoneNumber: string) {
      const response = await api.get('/api/auth/check-phone', {
        params: { phone_number: phoneNumber },
      });
      return response.data;
    },

    /**
     * Step 1/3: Request a password-reset OTP via SMS.
     */
    async resetPassword(phoneNumber: string) {
      const response = await api.post('/api/auth/reset-password', {
        phone_number: phoneNumber,
      });
      return response.data;
    },

    /**
     * Step 2/3: Verify the reset OTP. Returns a reset_token.
     */
    async resetPasswordVerify(phoneNumber: string, code: string) {
      const response = await api.post('/api/auth/reset-password-verify', {
        phone_number: phoneNumber,
        code,
      });
      return response.data;
    },

    /**
     * Step 1/3 (email): Request a password-reset OTP via email.
     */
    async resetPasswordEmail(email: string) {
      const response = await api.post('/api/auth/reset-password-email', {
        email,
      });
      return response.data;
    },

    /**
     * Step 2/3 (email): Verify the emailed reset OTP. Returns a reset_token.
     */
    async resetPasswordEmailVerify(email: string, code: string) {
      const response = await api.post(
        '/api/auth/reset-password-email-verify',
        { email, code },
      );
      return response.data;
    },

    /**
     * Step 3/3: Confirm new password using the reset_token from step 2.
     */
    async resetPasswordConfirm(resetToken: string, newPassword: string) {
      const response = await api.post('/api/auth/reset-password-confirm', {
        reset_token: resetToken,
        new_password: newPassword,
      });
      return response.data;
    },

    /**
     * Resend email verification code for signup.
     *
     * TODO: A dedicated /api/auth/resend-email-verification endpoint should be
     * added to the backend. Currently this re-calls signup which regenerates
     * the verification code row — it only works while the user account has not
     * yet been created (i.e., before the OTP is verified).
     */
    async sendEmailVerification(email: string) {
      const response = await api.post('/api/auth/send-email-verification', {
        email,
      });
      return response.data;
    },

    /**
     * Refresh an expired access token.
     */
    async refreshToken(refreshToken: string) {
      const response = await api.post('/api/auth/refresh', {
        refresh_token: refreshToken,
      });
      return response.data;
    },

    /**
     * Get the authenticated user's info.
     */
    async getMe(): Promise<UserMeResponse> {
      const response = await api.get<UserMeResponse>('/api/auth/me');
      return response.data;
    },

    /**
     * Change the authenticated user's password.
     * Revokes all existing refresh tokens on success.
     *
     * @throws 401 when current_password is wrong.
     * @throws 400 when new_password is too short or the account is OAuth-only.
     */
    async changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
      const payload: ChangePasswordRequest = {
        current_password: currentPassword,
        new_password: newPassword,
      };
      const response = await api.post<ChangePasswordResponse>('/api/auth/change-password', payload);
      return response.data;
    },
  };
}
