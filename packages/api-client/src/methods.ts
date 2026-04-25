/**
 * API methods for Beach League backend.
 */

import type { ApiClient } from './client';
import type {
  Player,
  Match,
  League,
  Season,
  Session,
  SessionCreatePayload,
  Location,
  Court,
  Friend,
  FriendListResponse,
  FriendRequest,
  FriendInLeague,
  Notification,
  Conversation,
  ConversationListResponse,
  DirectMessage,
  ThreadResponse,
  MyStatsPayload,
  ChangePasswordRequest,
  ChangePasswordResponse,
} from '@beach-kings/shared';

export function createApiMethods(client: ApiClient) {
  const api = client.axiosInstance;

  return {
    // -----------------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------------

    /**
     * Password login — accepts phone_number OR email (not both).
     */
    async login(credentials: {
      phone_number?: string;
      email?: string;
      password: string;
    }) {
      const response = await api.post('/api/auth/login', credentials);
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
    }) {
      const response = await api.post('/api/auth/signup', data);
      return response.data;
    },

    async logout() {
      const response = await api.post('/api/auth/logout');
      return response.data;
    },

    /**
     * Exchange a Google ID token for Beach League auth tokens.
     */
    async googleAuth(idToken: string) {
      const response = await api.post('/api/auth/google', { id_token: idToken });
      return response.data;
    },

    /**
     * Exchange an Apple ID token for Beach League auth tokens.
     */
    async appleAuth(idToken: string) {
      const response = await api.post('/api/auth/apple', { id_token: idToken });
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
    async getMe() {
      const response = await api.get('/api/auth/me');
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

    // -----------------------------------------------------------------------
    // Player
    // -----------------------------------------------------------------------

    async getPlayers() {
      const response = await api.get<Player[]>('/api/players');
      return response.data;
    },

    async createPlayer(name: string) {
      const response = await api.post<Player>('/api/players', { name });
      return response.data;
    },

    async getPlayerStats(playerId: number | string) {
      const response = await api.get(`/api/players/${encodeURIComponent(playerId)}`);
      return response.data;
    },

    async getPlayerSeasonStats(playerId: number, seasonId: number) {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/stats`);
      return response.data;
    },

    async getPlayerMatchHistory(playerId: number | string) {
      const response = await api.get(`/api/players/${encodeURIComponent(playerId)}/matches`);
      return response.data;
    },

    async getPlayerSeasonPartnershipOpponentStats(playerId: number, seasonId: number) {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Match
    // -----------------------------------------------------------------------

    async getMatches() {
      const response = await api.get<Match[]>('/api/matches');
      return response.data;
    },

    async queryMatches(queryParams: Record<string, unknown>) {
      const response = await api.post<Match[]>('/api/matches/search', queryParams);
      return response.data;
    },

    async createMatch(matchData: Partial<Match>) {
      const response = await api.post<Match>('/api/matches', matchData);
      return response.data;
    },

    async updateMatch(matchId: number, matchData: Partial<Match>) {
      const response = await api.put<Match>(`/api/matches/${matchId}`, matchData);
      return response.data;
    },

    async deleteMatch(matchId: number) {
      const response = await api.delete(`/api/matches/${matchId}`);
      return response.data;
    },

    /**
     * Export matches to CSV. Web-only — uses DOM APIs for file download.
     * Throws on non-browser environments (React Native).
     */
    async exportMatchesToCSV() {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('exportMatchesToCSV is only available in web browsers');
      }
      const response = await api.get('/api/matches/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'matches_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },

    // -----------------------------------------------------------------------
    // Rankings
    // -----------------------------------------------------------------------

    async getRankings(queryParams: Record<string, unknown> = {}) {
      const response = await api.post('/api/rankings', queryParams);
      return response.data;
    },

    async getEloTimeline() {
      const response = await api.get('/api/elo-timeline');
      return response.data;
    },

    // -----------------------------------------------------------------------
    // League
    // -----------------------------------------------------------------------

    async listLeagues() {
      const response = await api.get<League[]>('/api/leagues');
      return response.data;
    },

    async getLeague(leagueId: number) {
      const response = await api.get<League>(`/api/leagues/${leagueId}`);
      return response.data;
    },

    async createLeague(leagueData: Partial<League>) {
      const response = await api.post<League>('/api/leagues', leagueData);
      return response.data;
    },

    async updateLeague(leagueId: number, leagueData: Partial<League>) {
      const response = await api.put<League>(`/api/leagues/${leagueId}`, leagueData);
      return response.data;
    },

    async getLeagueSeasons(leagueId: number) {
      const response = await api.get<Season[]>(`/api/leagues/${leagueId}/seasons`);
      return response.data;
    },

    async getLeagueMembers(leagueId: number) {
      const response = await api.get(`/api/leagues/${leagueId}/members`);
      return response.data;
    },

    async getUserLeagues() {
      const response = await api.get<League[]>('/api/users/me/leagues');
      return response.data;
    },

    async addLeagueMember(leagueId: number, playerId: number, role = 'member') {
      const response = await api.post(`/api/leagues/${leagueId}/members`, { player_id: playerId, role });
      return response.data;
    },

    async removeLeagueMember(leagueId: number, memberId: number) {
      const response = await api.delete(`/api/leagues/${leagueId}/members/${memberId}`);
      return response.data;
    },

    async leaveLeague(leagueId: number) {
      const response = await api.post(`/api/leagues/${leagueId}/leave`);
      return response.data;
    },

    async updateLeagueMember(leagueId: number, memberId: number, role: string) {
      const response = await api.put(`/api/leagues/${leagueId}/members/${memberId}`, { role });
      return response.data;
    },

    async createLeagueSeason(leagueId: number, seasonData: Partial<Season>) {
      const response = await api.post<Season>(`/api/leagues/${leagueId}/seasons`, seasonData);
      return response.data;
    },

    async createLeagueSession(leagueId: number, sessionData: Partial<Session>) {
      const response = await api.post<Session>(`/api/leagues/${leagueId}/sessions`, sessionData);
      return response.data;
    },

    /**
     * Add a home court to a league (league_admin).
     * Called right after league creation when the user selected a court.
     */
    async addLeagueHomeCourt(leagueId: number, courtId: number) {
      const response = await api.post(`/api/leagues/${leagueId}/home-courts`, { court_id: courtId });
      return response.data;
    },

    async getLeagueMessages(leagueId: number) {
      const response = await api.get(`/api/leagues/${leagueId}/messages`);
      return response.data;
    },

    async createLeagueMessage(leagueId: number, message: string) {
      const response = await api.post(`/api/leagues/${leagueId}/messages`, { message });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Season
    // -----------------------------------------------------------------------

    async getSeasonMatches(seasonId: number) {
      const response = await api.get<Match[]>(`/api/seasons/${seasonId}/matches`);
      return response.data;
    },

    async getAllPlayerSeasonStats(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/player-stats`);
      return response.data;
    },

    async getAllSeasonPartnershipOpponentStats(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Session
    // -----------------------------------------------------------------------

    async getSessions() {
      const response = await api.get<Session[]>('/api/sessions');
      return response.data;
    },

    async getActiveSession(): Promise<Session | null> {
      const response = await api.get<Session[]>('/api/sessions/open');
      return response.data?.[0] ?? null;
    },

    /**
     * Create a new non-league session.
     *
     * Accepts the full session create payload. All fields are optional;
     * `date` defaults to today on the backend when omitted.
     */
    async createSession(payload?: SessionCreatePayload | null) {
      const response = await api.post<Session>('/api/sessions', payload ?? {});
      return response.data;
    },

    async lockInSession(sessionId: number) {
      const response = await api.patch(`/api/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async lockInLeagueSession(leagueId: number, sessionId: number) {
      const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async deleteSession(sessionId: number) {
      const response = await api.delete(`/api/sessions/${sessionId}`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // User
    // -----------------------------------------------------------------------

    async getCurrentUserPlayer() {
      const response = await api.get<Player>('/api/users/me/player');
      return response.data;
    },

    /**
     * Fetch the authenticated player's full stats payload.
     * Powers the My Stats screen.
     */
    async getMyStats(params?: {
      league_id?: number | null;
      days?: number | null;
    }): Promise<MyStatsPayload> {
      const response = await api.get<MyStatsPayload>('/api/users/me/stats', { params });
      return response.data;
    },

    async updatePlayerProfile(playerData: Partial<Player>) {
      const response = await api.put<Player>('/api/users/me/player', playerData);
      return response.data;
    },

    async updateUserProfile(userData: { name?: string; email?: string }) {
      const response = await api.put('/api/users/me', userData);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------------

    async getLocations() {
      const response = await api.get<Location[]>('/api/locations');
      return response.data;
    },

    async getLocationDistances(lat: number, lon: number) {
      const response = await api.get<Location[]>('/api/locations/distances', { params: { lat, lon } });
      return response.data;
    },

    async getCityAutocomplete(text: string) {
      const response = await api.get('/api/geocode/autocomplete', { params: { text } });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Court
    // -----------------------------------------------------------------------

    async getCourts(params?: { location_id?: string | null; lat?: number; lon?: number; radius?: number }) {
      const response = await api.get<{ items: Court[] } | Court[]>('/api/public/courts', {
        params: params ?? {},
      });
      const data = response.data;
      if (Array.isArray(data)) return data;
      return data?.items ?? [];
    },

    /**
     * Fetch full detail for a single court by numeric id or slug.
     * Returns 404 when the court is not found.
     */
    async getCourtById(idOrSlug: string | number): Promise<Court> {
      const response = await api.get<Court>(`/api/courts/${idOrSlug}`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Weekly Schedule
    // -----------------------------------------------------------------------

    async createWeeklySchedule(seasonId: number, scheduleData: Record<string, unknown>) {
      const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
      return response.data;
    },

    async getWeeklySchedules(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
      return response.data;
    },

    async updateWeeklySchedule(scheduleId: number, scheduleData: Record<string, unknown>) {
      const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
      return response.data;
    },

    async deleteWeeklySchedule(scheduleId: number) {
      const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Signup
    // -----------------------------------------------------------------------

    async createSignup(seasonId: number, signupData: Record<string, unknown>) {
      const response = await api.post(`/api/seasons/${seasonId}/signups`, signupData);
      return response.data;
    },

    async getSignups(seasonId: number, options: { upcoming_only?: boolean; past_only?: boolean; include_players?: boolean } = {}) {
      const params = new URLSearchParams();
      if (options.upcoming_only) params.append('upcoming_only', 'true');
      if (options.past_only) params.append('past_only', 'true');
      if (options.include_players) params.append('include_players', 'true');
      const queryString = params.toString();
      const url = `/api/seasons/${seasonId}/signups${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      return response.data;
    },

    async getSignup(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}`);
      return response.data;
    },

    async updateSignup(signupId: number, signupData: Record<string, unknown>) {
      const response = await api.put(`/api/signups/${signupId}`, signupData);
      return response.data;
    },

    async deleteSignup(signupId: number) {
      const response = await api.delete(`/api/signups/${signupId}`);
      return response.data;
    },

    async signupForSignup(signupId: number) {
      const response = await api.post(`/api/signups/${signupId}/signup`);
      return response.data;
    },

    async dropoutFromSignup(signupId: number) {
      const response = await api.post(`/api/signups/${signupId}/dropout`);
      return response.data;
    },

    async getSignupPlayers(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}/players`);
      return response.data;
    },

    async getSignupEvents(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}/events`);
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Friends
    // -----------------------------------------------------------------------

    async getFriends(params?: { search?: string; limit?: number; offset?: number }) {
      const response = await api.get<FriendListResponse>('/api/friends', { params: params ?? {} });
      return response.data;
    },

    async getFriendRequests(direction?: 'received' | 'sent') {
      const params = direction ? { direction } : {};
      const response = await api.get<FriendRequest[]>('/api/friends/requests', { params });
      return response.data;
    },

    async sendFriendRequest(receiverPlayerId: number) {
      const response = await api.post('/api/friends/request', { receiver_player_id: receiverPlayerId });
      return response.data;
    },

    async acceptFriendRequest(requestId: number) {
      const response = await api.post(`/api/friends/requests/${requestId}/accept`);
      return response.data;
    },

    async declineFriendRequest(requestId: number) {
      const response = await api.post(`/api/friends/requests/${requestId}/decline`);
      return response.data;
    },

    async cancelFriendRequest(requestId: number) {
      const response = await api.delete(`/api/friends/requests/${requestId}`);
      return response.data;
    },

    async removeFriend(playerIdToRemove: number) {
      const response = await api.delete(`/api/friends/${playerIdToRemove}`);
      return response.data;
    },

    async getFriendSuggestions() {
      const response = await api.get<Friend[]>('/api/friends/suggestions');
      return response.data;
    },

    async batchFriendStatus(playerIds: number[]) {
      const response = await api.post<Record<string, string>>('/api/friends/batch-status', { player_ids: playerIds });
      return response.data;
    },

    async getMutualFriends(otherPlayerId: number) {
      const response = await api.get<FriendInLeague[]>(`/api/friends/mutual/${otherPlayerId}`);
      return response.data;
    },

    async discoverPlayers(params: Record<string, unknown> = {}) {
      const response = await api.get('/api/friends/discover', { params });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Notifications
    // -----------------------------------------------------------------------

    async getNotifications(params?: { limit?: number; offset?: number }) {
      const response = await api.get<Notification[]>('/api/notifications', { params: params ?? {} });
      return response.data;
    },

    async getUnreadNotificationCount() {
      const response = await api.get<{ count: number }>('/api/notifications/unread-count');
      return response.data;
    },

    async markNotificationRead(notificationId: number) {
      const response = await api.put(`/api/notifications/${notificationId}/read`);
      return response.data;
    },

    async markAllNotificationsRead() {
      const response = await api.put('/api/notifications/mark-all-read');
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Feedback
    // -----------------------------------------------------------------------

    async submitFeedback(feedback: string, email?: string) {
      const response = await api.post('/api/feedback', { feedback_text: feedback, email: email || undefined });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    async getAdminConfig() {
      const response = await api.get('/api/admin-view/config');
      return response.data;
    },

    async updateAdminConfig(config: Record<string, unknown>) {
      const response = await api.put('/api/admin-view/config', config);
      return response.data;
    },

    async getAdminFeedback() {
      const response = await api.get('/api/admin-view/feedback');
      return response.data;
    },

    async updateFeedbackResolution(feedbackId: number, isResolved: boolean) {
      const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, { is_resolved: isResolved });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Health
    // -----------------------------------------------------------------------

    async healthCheck() {
      const response = await api.get('/api/health');
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Invites
    // -----------------------------------------------------------------------

    /**
     * Get public-facing details for an invite token (no auth required).
     */
    async getInviteDetails(token: string) {
      const response = await api.get(
        `/api/invites/${encodeURIComponent(token)}`,
      );
      return response.data;
    },

    /**
     * Claim an invite — merge placeholder data into the authenticated user.
     */
    async claimInvite(token: string) {
      const response = await api.post(
        `/api/invites/${encodeURIComponent(token)}/claim`,
      );
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Direct Messages
    // -----------------------------------------------------------------------

    /**
     * Get the current user's conversation list, ordered by most recent.
     */
    async getConversations(page = 1, pageSize = 50): Promise<ConversationListResponse> {
      const response = await api.get<ConversationListResponse>(
        '/api/messages/conversations',
        { params: { page, page_size: pageSize } },
      );
      return response.data;
    },

    /**
     * Get messages in a thread with a specific player (newest first).
     */
    async getThread(
      playerId: number,
      page = 1,
      pageSize = 50,
    ): Promise<ThreadResponse> {
      const response = await api.get<ThreadResponse>(
        `/api/messages/conversations/${encodeURIComponent(playerId)}`,
        { params: { page, page_size: pageSize } },
      );
      return response.data;
    },

    /**
     * Send a direct message to another player.
     */
    async sendDirectMessage(
      receiverPlayerId: number,
      messageText: string,
    ): Promise<DirectMessage> {
      const response = await api.post<DirectMessage>('/api/messages/send', {
        receiver_player_id: receiverPlayerId,
        message_text: messageText,
      });
      return response.data;
    },

    /**
     * Mark all messages from a specific player as read.
     */
    async markThreadRead(
      playerId: number,
    ): Promise<{ updated_count: number }> {
      const response = await api.put<{ updated_count: number }>(
        `/api/messages/conversations/${encodeURIComponent(playerId)}/read`,
      );
      return response.data;
    },

    /**
     * Get total unread DM count across all conversations.
     */
    async getDmUnreadCount(): Promise<{ count: number }> {
      const response = await api.get<{ count: number }>(
        '/api/messages/unread-count',
      );
      return response.data;
    },
  };
}

export type ApiMethods = ReturnType<typeof createApiMethods>;
