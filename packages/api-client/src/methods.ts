/**
 * API methods for Beach League backend.
 */

import type { ApiClient } from './client';
import type {
  Player,
  PlayerHomeCourt,
  PlayerSearchResponse,
  Match,
  League,
  Season,
  Session,
  SessionCreatePayload,
  GameCreatePayload,
  GameCreateResponse,
  SessionParticipant,
  SessionDetail,
  Location,
  Court,
  CourtPhoto,
  CourtCheckIn,
  CourtCheckInsResponse,
  ReviewActionResponse,
  CreateCourtReviewInput,
  UpdateCourtReviewInput,
  Friend,
  FriendListResponse,
  FriendRequest,
  FriendInLeague,
  Notification,
  PushNotificationPrefs,
  Conversation,
  ConversationListResponse,
  DirectMessage,
  ThreadResponse,
  MyStatsPayload,
  ChangePasswordRequest,
  ChangePasswordResponse,
  MyGamesQueryParams,
  MyGamesResponse,
  LeagueGamesResponse,
  JoinRequest,
  JoinRequestsResponse,
  LeagueSignupsApiResponse,
  FindLeagueResult,
  LeagueQueryResponse,
  LeagueStandingsResponse,
  LeagueDetail,
  LeagueMemberApiRow,
  LeaguePlayerStats,
  InvitablePlayer,
  LeagueInviteItem,
  InviteActionResponse,
  AuthResponse,
  UserMeResponse,
  StatusResponse,
  UserUpdateRequest,
  CreatePlaceholderRequest,
  PlaceholderPlayerResponse,
  PlayerLeague,
  PublicPlayerResponse,
} from '@beach-kings/shared';

/**
 * Maps a public player profile response (GET /api/public/players/{id}) onto the
 * flat {@link Player} shape consumed by the mobile profile screen.
 *
 * The public endpoint nests rating/games under `stats` and city/state under
 * `location`, whereas the profile header + stats grid read them as top-level
 * Player fields. This adapter bridges that gap (and mirrors how the web
 * PublicPlayerPage consumes the same endpoint).
 */
export function mapPublicPlayerToPlayer(res: PublicPlayerResponse): Player {
  const rawWins = res.stats.total_wins;
  const games = res.stats.total_games;

  // Hide only the win/loss derived fields when:
  //  a) the backend flagged win/loss history as not visible, OR
  //  b) total_wins is null (backend omitted it — prevents fabricated "0-N" losses)
  // NOTE: current_rating (ELO) is ALWAYS preserved — the backend returns it
  // regardless of the game_history_visible setting.
  const hideWinStats = res.game_history_visible === false || rawWins === null;

  const wins = hideWinStats ? null : rawWins;
  // rawWins is non-null here because hideWinStats would be true otherwise.
  const losses = hideWinStats ? null : games - (rawWins as number);

  return {
    id: res.id,
    name: res.full_name,
    full_name: res.full_name,
    avatar: res.avatar,
    gender: res.gender,
    level: res.level,
    is_placeholder: res.is_placeholder,
    city: res.location?.city ?? null,
    state: res.location?.state ?? null,
    location_id: res.location?.id ?? null,
    location_name: res.location?.name ?? null,
    location_slug: res.location?.slug ?? null,
    current_rating: res.stats.current_rating,
    total_games: games,
    total_wins: wins,
    wins,
    losses,
    league_memberships: res.league_memberships,
    game_history_visible: res.game_history_visible,
    profile_is_private: res.profile_is_private,
  };
}

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

    // -----------------------------------------------------------------------
    // Player
    // -----------------------------------------------------------------------

    async getPlayers() {
      const response = await api.get<Player[]>('/api/players');
      return response.data;
    },

    /**
     * Relevance-ranked player search for pickers.
     *
     * Players are scored additively by their relationship to the caller and
     * returned as a single bounded, deduped list with up to three pills
     * (`item.tags`): the caller's whole network first, then (only on a name
     * query) capped score-0 strangers. There is no cursor — the client
     * scrolls the returned set locally.
     */
    async searchPlayers(
      q: string,
      opts: {
        sessionId?: number | null;
        leagueId?: number | null;
        limit?: number;
      } = {},
    ): Promise<PlayerSearchResponse> {
      const params: Record<string, string | number> = { q };
      if (opts.sessionId != null) params.session_id = opts.sessionId;
      if (opts.leagueId != null) params.league_id = opts.leagueId;
      if (opts.limit != null) params.limit = opts.limit;
      const response = await api.get<PlayerSearchResponse>('/api/players/search', { params });
      return response.data;
    },

    async createPlayer(name: string) {
      const response = await api.post<Player>('/api/players', { name });
      return response.data;
    },

    async createPlaceholder(payload: CreatePlaceholderRequest): Promise<PlaceholderPlayerResponse> {
      const response = await api.post<PlaceholderPlayerResponse>('/api/players/placeholder', payload);
      return response.data;
    },

    /**
     * Fetch a public player profile (no auth required) and adapt it to the flat
     * Player shape. Maps to GET /api/public/players/{id}; 404s for unknown
     * players or players with no games. Used by the mobile PlayerProfile screen.
     */
    async getPublicPlayer(playerId: number | string): Promise<Player> {
      const response = await api.get<PublicPlayerResponse>(
        `/api/public/players/${encodeURIComponent(playerId)}`,
      );
      return mapPublicPlayerToPlayer(response.data);
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

    /**
     * Get public leagues for a given player (public-only, no auth required).
     * Returns [] if the player has no public league memberships.
     */
    async getPlayerLeagues(playerId: number): Promise<PlayerLeague[]> {
      const response = await api.get<PlayerLeague[]>(`/api/players/${playerId}/leagues`);
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

    /**
     * Submit a scored game from the score-entry screen.
     *
     * Pass `session_id: null` to create a brand-new session at the same time.
     * The response always includes the resolved `session_id` (newly created or
     * the one you passed in).
     */
    async submitScoredGame(payload: GameCreatePayload): Promise<GameCreateResponse> {
      const response = await api.post<GameCreateResponse>('/api/matches', payload);
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

    async getLeague(leagueId: number): Promise<LeagueDetail> {
      const response = await api.get<{
        id: number;
        name: string;
        description: string | null;
        is_open: boolean;
        gender: string | null;
        level: string | null;
        location_id: string | null;
        location_name: string | null;
        home_courts: Array<{ id: number; name: string; address: string | null; position: number }>;
        member_count: number;
        season_count: number;
        current_season_id: number | null;
        current_season_name: string | null;
        is_active: boolean;
        user_role: string | null;
        user_rank: number | null;
        user_wins: number | null;
        user_losses: number | null;
        user_rating: number | null;
      }>(`/api/leagues/${leagueId}`);
      const raw = response.data;
      return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        access_type: raw.is_open ? 'open' : 'invite_only',
        gender: raw.gender as 'mens' | 'womens' | 'coed' | null,
        level: raw.level,
        location_id: raw.location_id ?? null,
        location_name: raw.location_name,
        home_courts: raw.home_courts,
        member_count: raw.member_count,
        season_count: raw.season_count,
        current_season_id: raw.current_season_id,
        current_season_name: raw.current_season_name,
        is_active: raw.is_active,
        user_role: raw.user_role as 'admin' | 'member' | null,
        user_rank: raw.user_rank,
        user_wins: raw.user_wins,
        user_losses: raw.user_losses,
        user_rating: raw.user_rating,
      };
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

    async getLeagueStandings(leagueId: number, seasonId?: number) {
      const params = seasonId != null ? `?season_id=${seasonId}` : '';
      const response = await api.get<LeagueStandingsResponse>(
        `/api/leagues/${leagueId}/standings${params}`,
      );
      return response.data;
    },

    /**
     * All games in a league across every session, for the All Games view.
     * Maps to GET /api/leagues/:leagueId/games.
     *
     * @param leagueId League to fetch games for.
     * @param params Optional pagination: `limit` (1-500, default 200) and `offset`.
     */
    async getLeagueGames(
      leagueId: number,
      params?: { limit?: number; offset?: number },
    ): Promise<LeagueGamesResponse> {
      const response = await api.get<LeagueGamesResponse>(
        `/api/leagues/${leagueId}/games`,
        { params },
      );
      return response.data;
    },

    /**
     * Aggregated stats for a player in the context of a league.
     * Maps to GET /api/leagues/:leagueId/players/:playerId/stats[?season_id=].
     */
    async getLeaguePlayerStats(
      leagueId: number,
      playerId: number,
      seasonId?: number | null,
    ): Promise<LeaguePlayerStats> {
      const params = seasonId != null ? `?season_id=${seasonId}` : '';
      const response = await api.get<LeaguePlayerStats>(
        `/api/leagues/${leagueId}/players/${playerId}/stats${params}`,
      );
      return response.data;
    },

    async getLeagueMembers(leagueId: number): Promise<LeagueMemberApiRow[]> {
      const response = await api.get<LeagueMemberApiRow[]>(`/api/leagues/${leagueId}/members`);
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

    /** Remove a home court from a league (league_admin). */
    async removeLeagueHomeCourt(leagueId: number, courtId: number) {
      const response = await api.delete(`/api/leagues/${leagueId}/home-courts/${courtId}`);
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

    /**
     * Submit a join request for an invite-only league.
     * Maps to POST /api/leagues/{leagueId}/request-join.
     */
    async requestToJoinLeague(leagueId: number): Promise<{ success: boolean; message: string }> {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/leagues/${leagueId}/request-join`,
      );
      return response.data;
    },

    /**
     * Cancel the current user's pending join request.
     * Maps to DELETE /api/leagues/{leagueId}/join-request.
     */
    async cancelJoinRequest(leagueId: number): Promise<{ success: boolean; message: string }> {
      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/leagues/${leagueId}/join-request`,
      );
      return response.data;
    },

    /**
     * List pending and rejected join requests for a league (league admin only).
     * Maps to GET /api/leagues/{leagueId}/join-requests.
     */
    async getLeagueJoinRequests(leagueId: number): Promise<JoinRequestsResponse> {
      const response = await api.get<JoinRequestsResponse>(
        `/api/leagues/${leagueId}/join-requests`,
      );
      return response.data;
    },

    /**
     * Approve a join request and add the player to the league (league admin).
     * Maps to POST /api/leagues/{leagueId}/join-requests/{requestId}/approve.
     */
    async approveJoinRequest(leagueId: number, requestId: number): Promise<{ success: boolean }> {
      const response = await api.post<{ success: boolean }>(
        `/api/leagues/${leagueId}/join-requests/${requestId}/approve`,
      );
      return response.data;
    },

    /**
     * Reject a join request (league admin).
     * Maps to POST /api/leagues/{leagueId}/join-requests/{requestId}/reject.
     */
    async rejectJoinRequest(leagueId: number, requestId: number): Promise<{ success: boolean }> {
      const response = await api.post<{ success: boolean }>(
        `/api/leagues/${leagueId}/join-requests/${requestId}/reject`,
      );
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
      const response = await api.get<Session[]>('/api/sessions/open');
      return response.data;
    },

    async getActiveSession(): Promise<Session | null> {
      const response = await api.get<Session[]>('/api/sessions/open');
      return response.data?.[0] ?? null;
    },

    /**
     * Create (or get-or-create) a session.
     *
     * Backend returns `{ status, message, session }` — we unwrap to the
     * inner session so callers can read `.id` directly. League payloads
     * (with `league_id`) hit the idempotent get-or-create path.
     */
    async createSession(payload?: SessionCreatePayload | null): Promise<Session | null> {
      const response = await api.post<{ status: string; message: string; session: Session }>(
        '/api/sessions',
        payload ?? {},
      );
      return response.data?.session ?? null;
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

    /**
     * Fetch the roster for a session (participants + players with matches).
     * Used by the score-entry screen's roster picker when a session is active.
     *
     * Maps to GET /api/sessions/:id/participants.
     */
    async getSessionParticipants(sessionId: number): Promise<SessionParticipant[]> {
      const response = await api.get<SessionParticipant[]>(
        `/api/sessions/${sessionId}/participants`,
      );
      return response.data;
    },

    /**
     * Fetch full session detail including roster, games, and user stats.
     *
     * The backend normalises status to uppercase ('ACTIVE', 'SUBMITTED').
     * The client normalises to lowercase to match the SessionDetail type and
     * existing screen-component comparisons.
     *
     * Maps to GET /api/sessions/:id.
     */
    async getSessionById(sessionId: number): Promise<SessionDetail> {
      const response = await api.get<SessionDetail>(`/api/sessions/${sessionId}`);
      const raw = response.data;
      const normalized = (raw.status ?? '').toString().toLowerCase();
      const status: SessionDetail['status'] =
        normalized === 'submitted' ? 'submitted' : 'active';
      return { ...raw, status };
    },

    /**
     * Remove a player from a session roster.
     * `playerId` is the player_id of the participant to remove.
     *
     * Maps to DELETE /api/sessions/:id/participants/:player_id.
     */
    async removeSessionPlayer(sessionId: number, playerId: number): Promise<void> {
      await api.delete(`/api/sessions/${sessionId}/participants/${playerId}`);
    },

    /**
     * Invite a player to join a session.
     * `playerId` is the player_id of the player to invite.
     *
     * Maps to POST /api/sessions/:id/invite.
     */
    async inviteSessionPlayer(
      sessionId: number,
      playerId: number,
    ): Promise<{ status: string; message: string }> {
      const response = await api.post<{ status: string; message: string }>(
        `/api/sessions/${sessionId}/invite`,
        { player_id: playerId },
      );
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

    /**
     * Fetch the authenticated player's game history.
     * Powers the My Games screen.
     *
     * Supports optional filtering by league_id, result, and pagination via
     * limit/offset.
     */
    async getMyGames(params?: MyGamesQueryParams): Promise<MyGamesResponse> {
      const response = await api.get<MyGamesResponse>('/api/users/me/games', {
        params: params ?? {},
      });
      return response.data;
    },

    async updatePlayerProfile(playerData: Partial<Player>) {
      const response = await api.put<Player>('/api/users/me/player', playerData);
      return response.data;
    },

    async updateUserProfile(userData: UserUpdateRequest): Promise<UserMeResponse> {
      const response = await api.put<UserMeResponse>('/api/users/me', userData);
      return response.data;
    },

    /**
     * Schedule the authenticated user's account for deletion after a 30-day
     * grace period. The user can cancel by calling `cancelAccountDeletion()`.
     *
     * Maps to POST /api/users/me/delete.
     */
    async scheduleAccountDeletion(): Promise<StatusResponse> {
      const response = await api.post<StatusResponse>('/api/users/me/delete');
      return response.data;
    },

    /**
     * Cancel a pending account deletion while still within the 30-day grace
     * period.
     *
     * Maps to POST /api/users/me/cancel-deletion.
     */
    async cancelAccountDeletion(): Promise<StatusResponse> {
      const response = await api.post<StatusResponse>('/api/users/me/cancel-deletion');
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

    /**
     * Fetch public courts. When `user_lat`/`user_lng` are provided the backend
     * sorts by haversine distance and populates `distance_miles` per court;
     * otherwise results come back alphabetically by name.
     *
     * NOTE: the param names must be `user_lat`/`user_lng` — the backend
     * `/api/public/courts` endpoint ignores any other coordinate keys, which
     * would silently fall back to alphabetical ordering.
     */
    async getCourts(params?: {
      location_id?: string | null;
      user_lat?: number;
      user_lng?: number;
    }) {
      const response = await api.get<{ items: Court[] } | Court[]>('/api/public/courts', {
        params: params ?? {},
      });
      const data = response.data;
      if (Array.isArray(data)) return data;
      return data?.items ?? [];
    },

    /**
     * Fetch a player's home courts (ordered by position), including
     * coordinates. Used as a fallback when resolving the user's location.
     *
     * Maps to GET /api/players/{playerId}/home-courts.
     */
    async getPlayerHomeCourts(playerId: number): Promise<PlayerHomeCourt[]> {
      const response = await api.get<PlayerHomeCourt[]>(
        `/api/players/${playerId}/home-courts`,
      );
      return response.data;
    },

    /**
     * Fetch full detail for a single court by numeric id or slug.
     * Returns 404 when the court is not found.
     */
    async getCourtById(idOrSlug: string | number): Promise<Court> {
      const response = await api.get<Court>(`/api/courts/${idOrSlug}`);
      return response.data;
    },

    /**
     * List standalone photos for a court (public — no auth required).
     * Accepts numeric id or url slug.
     */
    async getCourtPhotos(idOrSlug: string | number): Promise<CourtPhoto[]> {
      const response = await api.get<CourtPhoto[]>(
        `/api/public/courts/${idOrSlug}/photos`,
      );
      return response.data;
    },

    /**
     * Upload a standalone photo to a court (multipart form data).
     *
     * `file` accepts either a web `File` / `Blob` or the React Native shape
     * `{ uri, name, type }` produced by image pickers — both are valid
     * `FormData.append` payloads at runtime.
     */
    async uploadCourtPhoto(
      courtId: number,
      file: File | Blob | { uri: string; name: string; type: string },
      caption?: string,
    ): Promise<CourtPhoto> {
      const form = new FormData();
      // FormData accepts native-style `{ uri, name, type }` on React Native
      // even though the DOM lib types only allow Blob/File.
      form.append('file', file as unknown as Blob);
      if (caption != null && caption.trim().length > 0) {
        form.append('caption', caption.trim());
      }
      // Do NOT hardcode `Content-Type: multipart/form-data`. On React Native
      // that suppresses the auto-generated `boundary=...` parameter, so the
      // backend cannot parse the body and rejects it with a 400. Setting the
      // header to `undefined` removes the axios JSON default and lets the
      // native XHR layer set the correct multipart Content-Type (with boundary).
      const response = await api.post<CourtPhoto>(
        `/api/courts/${courtId}/photos`,
        form,
        { headers: { 'Content-Type': undefined } },
      );
      return response.data;
    },

    /**
     * Check the current player in to a court.
     *
     * Requires authentication. Check-in auto-expires after 4 hours. Returns
     * the created check-in record.
     */
    async checkInToCourt(courtId: number): Promise<CourtCheckIn> {
      const response = await api.post<CourtCheckIn>(
        `/api/courts/${courtId}/check-in`,
      );
      return response.data;
    },

    /**
     * Check the current player out of a court.
     *
     * Requires authentication. Returns confirmation that the check-in was
     * removed.
     */
    async checkOutOfCourt(
      courtId: number,
    ): Promise<{ court_id: number; checked_out: boolean }> {
      const response = await api.delete<{
        court_id: number;
        checked_out: boolean;
      }>(`/api/courts/${courtId}/check-in`);
      return response.data;
    },

    /**
     * Fetch the current active check-ins at a court (public — no auth required).
     *
     * Accepts a numeric id or url slug. Returns the count and the list of
     * players currently checked in.
     */
    async getCourtCheckIns(
      idOrSlug: string | number,
    ): Promise<CourtCheckInsResponse> {
      const response = await api.get<CourtCheckInsResponse>(
        `/api/public/courts/${idOrSlug}/check-ins`,
      );
      return response.data;
    },

    /**
     * List the curated court review tags (public — no auth required).
     *
     * Returns tags grouped by category (quality, vibe, facility), ordered by
     * sort_order.
     */
    async getCourtTags(): Promise<
      Array<{
        id: number;
        name: string;
        slug: string;
        category: string;
        sort_order: number;
      }>
    > {
      const response = await api.get<
        Array<{
          id: number;
          name: string;
          slug: string;
          category: string;
          sort_order: number;
        }>
      >('/api/public/courts/tags');
      return response.data;
    },

    /**
     * Create a review for a court (one per player per court).
     *
     * Requires authentication. Rating 1-5 is required; review_text and tag_ids
     * are optional. Returns aggregate review stats for the court.
     */
    async createCourtReview(
      courtId: number,
      input: CreateCourtReviewInput,
    ): Promise<ReviewActionResponse> {
      const response = await api.post<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews`,
        input,
      );
      return response.data;
    },

    /**
     * Update an existing court review (author only).
     *
     * Requires authentication. Only supplied fields are updated. Returns
     * aggregate review stats for the court.
     */
    async updateCourtReview(
      courtId: number,
      reviewId: number,
      input: UpdateCourtReviewInput,
    ): Promise<ReviewActionResponse> {
      const response = await api.put<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews/${reviewId}`,
        input,
      );
      return response.data;
    },

    /**
     * Delete a court review (author only).
     *
     * Requires authentication. Returns aggregate review stats for the court
     * after deletion.
     */
    async deleteCourtReview(
      courtId: number,
      reviewId: number,
    ): Promise<ReviewActionResponse> {
      const response = await api.delete<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews/${reviewId}`,
      );
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Saved courts ("My Courts")
    // -----------------------------------------------------------------------

    /**
     * Save a court to the authenticated player's "My Courts" (idempotent).
     *
     * Requires authentication. Returns the saved state for the court.
     */
    async saveCourt(courtId: number): Promise<{ court_id: number; saved: boolean }> {
      const response = await api.post<{ court_id: number; saved: boolean }>(
        '/api/users/me/courts',
        { court_id: courtId },
      );
      return response.data;
    },

    /**
     * Remove a court from the authenticated player's "My Courts" (idempotent).
     *
     * Requires authentication. Returns the (now unsaved) state for the court.
     */
    async unsaveCourt(courtId: number): Promise<{ court_id: number; saved: boolean }> {
      const response = await api.delete<{ court_id: number; saved: boolean }>(
        `/api/users/me/courts/${courtId}`,
      );
      return response.data;
    },

    /**
     * List the authenticated player's saved courts ("My Courts") as court cards.
     *
     * Requires authentication. Each card includes ``is_saved: true``.
     */
    async getMyCourts(): Promise<Court[]> {
      const response = await api.get<Court[]>('/api/users/me/courts');
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

    // -----------------------------------------------------------------------
    // League Signups
    // -----------------------------------------------------------------------

    /**
     * Get upcoming signups and weekly schedule for a league's active season.
     * Each signup includes the current user's sign-up status ('signed_up' | 'none').
     */
    async getLeagueSignups(leagueId: number): Promise<LeagueSignupsApiResponse> {
      const response = await api.get<LeagueSignupsApiResponse>(
        `/api/leagues/${encodeURIComponent(leagueId)}/signups`,
      );
      return response.data;
    },

    /**
     * Join a signup (player signs up for a specific session).
     */
    async joinSignup(signupId: number): Promise<void> {
      await api.post(`/api/signups/${encodeURIComponent(signupId)}/signup`);
    },

    /**
     * Drop from a signup (player drops out of a specific session).
     */
    async dropSignup(signupId: number): Promise<void> {
      await api.post(`/api/signups/${encodeURIComponent(signupId)}/dropout`);
    },

    /**
     * Search and filter leagues.
     * Maps to POST /api/leagues/query.
     * Adapts the raw backend response to the UI-ready FindLeagueResult shape:
     *   - is_open → access_type ('open' | 'invite_only')
     *   - has_pending_request → user_status ('requested' | 'none')
     *   - friends_preview[].first_name → friends_in_league[].initials
     */
    async queryLeagues(params: {
      q?: string | null;
      gender?: string | null;
      level?: string | null;
      is_open?: boolean | null;
      page?: number;
      page_size?: number;
    }): Promise<LeagueQueryResponse> {
      const body: Record<string, unknown> = {};
      if (params.q) body.q = params.q;
      if (params.gender) body.gender = params.gender;
      if (params.level) body.level = params.level;
      if (params.is_open != null) body.is_open = params.is_open;
      if (params.page != null) body.page = params.page;
      if (params.page_size != null) body.page_size = params.page_size;

      const response = await api.post<{
        items: Array<{
          id: number;
          name: string;
          gender: string;
          level: string | null;
          is_open: boolean;
          location_name: string | null;
          member_count: number;
          has_pending_request: boolean;
          friends_preview: Array<{ player_id: number; first_name: string; last_name: string | null; avatar: string | null }>;
        }>;
        page: number;
        page_size: number;
        total_count: number;
      }>('/api/leagues/query', body);

      const data = response.data;
      const items: FindLeagueResult[] = data.items.map((item) => ({
        id: item.id,
        name: item.name,
        gender: item.gender as 'mens' | 'womens' | 'coed',
        level: item.level,
        access_type: item.is_open ? 'open' : 'invite_only',
        location_name: item.location_name,
        member_count: item.member_count,
        friends_in_league: item.friends_preview.map((f) => ({
          player_id: f.player_id,
          initials: (f.first_name.charAt(0) + (f.last_name?.charAt(0) ?? '')).toUpperCase(),
        })),
        user_status: item.has_pending_request ? 'requested' : 'none',
      }));

      return { items, page: data.page, page_size: data.page_size, total_count: data.total_count };
    },

    // -----------------------------------------------------------------------
    // League invites
    // -----------------------------------------------------------------------

    /**
     * List players that an admin can invite to a league.
     * Maps to GET /api/leagues/{leagueId}/invitable-players?q={query}.
     */
    async getInvitablePlayers(leagueId: number, query?: string): Promise<InvitablePlayer[]> {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      const response = await api.get<InvitablePlayer[]>(
        `/api/leagues/${leagueId}/invitable-players`,
        { params },
      );
      return response.data;
    },

    /**
     * Send league invites to a list of players (admin only).
     * Maps to POST /api/leagues/{leagueId}/invites.
     */
    async sendLeagueInvites(leagueId: number, playerIds: number[]): Promise<void> {
      await api.post(`/api/leagues/${leagueId}/invites`, { player_ids: playerIds });
    },

    /**
     * List all pending invites for a league (admin view).
     * Maps to GET /api/leagues/{leagueId}/invites.
     */
    async getLeagueInvites(leagueId: number): Promise<LeagueInviteItem[]> {
      const response = await api.get<LeagueInviteItem[]>(`/api/leagues/${leagueId}/invites`);
      return response.data;
    },

    /**
     * List league invites sent by the current user across all leagues.
     * Maps to GET /api/users/me/league-invites/sent.
     */
    async getMySentLeagueInvites(): Promise<LeagueInviteItem[]> {
      const response = await api.get<LeagueInviteItem[]>('/api/users/me/league-invites/sent');
      return response.data;
    },

    /**
     * List league invites received by the current user across all leagues.
     * Maps to GET /api/users/me/league-invites/received.
     */
    async getReceivedLeagueInvites(): Promise<LeagueInviteItem[]> {
      const response = await api.get<LeagueInviteItem[]>('/api/users/me/league-invites/received');
      return response.data;
    },

    /**
     * Accept or decline a league invite (invitee only).
     *
     * `action` must be `'accept'` or `'decline'`. Use the thin wrappers
     * `acceptLeagueInvite` / `declineLeagueInvite` for call-site clarity.
     *
     * Maps to POST /api/leagues/{leagueId}/invites/respond.
     */
    async respondToLeagueInvite(
      leagueId: number,
      action: 'accept' | 'decline',
    ): Promise<InviteActionResponse> {
      const response = await api.post<InviteActionResponse>(
        `/api/leagues/${leagueId}/invites/respond`,
        { action },
      );
      return response.data;
    },

    /**
     * Accept a league invite (thin wrapper around `respondToLeagueInvite`).
     * Maps to POST /api/leagues/{leagueId}/invites/respond with action='accept'.
     */
    async acceptLeagueInvite(leagueId: number): Promise<InviteActionResponse> {
      const response = await api.post<InviteActionResponse>(
        `/api/leagues/${leagueId}/invites/respond`,
        { action: 'accept' },
      );
      return response.data;
    },

    /**
     * Decline a league invite (thin wrapper around `respondToLeagueInvite`).
     * Maps to POST /api/leagues/{leagueId}/invites/respond with action='decline'.
     */
    async declineLeagueInvite(leagueId: number): Promise<InviteActionResponse> {
      const response = await api.post<InviteActionResponse>(
        `/api/leagues/${leagueId}/invites/respond`,
        { action: 'decline' },
      );
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Push notification preferences
    // -----------------------------------------------------------------------

    /**
     * Fetch the authenticated user's push notification preferences.
     * Maps to GET /api/users/me/push-prefs.
     *
     * Returns defaults when no preference row has been saved yet.
     */
    async getPushNotificationPrefs(): Promise<PushNotificationPrefs> {
      const response = await api.get<PushNotificationPrefs>('/api/users/me/push-prefs');
      return response.data;
    },

    /**
     * Partially update the authenticated user's push notification preferences.
     * Maps to PATCH /api/users/me/push-prefs.
     *
     * Only fields included in `partial` are changed; omitted fields keep
     * their current (or default) values.
     */
    async updatePushNotificationPrefs(
      partial: Partial<PushNotificationPrefs>,
    ): Promise<PushNotificationPrefs> {
      const response = await api.patch<PushNotificationPrefs>(
        '/api/users/me/push-prefs',
        partial,
      );
      return response.data;
    },
  };
}

export type ApiMethods = ReturnType<typeof createApiMethods>;
