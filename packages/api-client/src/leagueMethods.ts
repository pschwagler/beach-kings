import type { AxiosInstance } from 'axios';
import type {
  Match,
  League,
  Season,
  Session,
  LeagueSessionSummary,
  LeagueGamesResponse,
  JoinRequestsResponse,
  LeagueStandingsResponse,
  LeagueDetail,
  LeagueMemberApiRow,
  LeagueMemberAddResult,
  LeaguePlayerStats,
} from '@beach-kings/shared';

/** API methods for the League and season domain. */
export function createLeagueMethods(api: AxiosInstance) {
  return {

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
        is_public?: boolean;
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
        has_pending_request?: boolean;
        join_request_status?: 'pending' | 'approved' | 'rejected' | null;
        created_by_player_id?: number | null;
      }>(`/api/leagues/${leagueId}`);
      const raw = response.data;
      return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        access_type: raw.is_open ? 'open' : 'invite_only',
        is_public: raw.is_public ?? false,
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
        has_pending_request: raw.has_pending_request ?? false,
        join_request_status: raw.join_request_status ?? null,
        created_by_player_id: raw.created_by_player_id ?? null,
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

    /** All sessions in a league, including authoritative game/player counts. */
    async getLeagueSessions(leagueId: number): Promise<LeagueSessionSummary[]> {
      const response = await api.get<LeagueSessionSummary[]>(
        `/api/leagues/${leagueId}/sessions`,
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

    /**
     * Consent-aware single-player add. The result may contain an immediate
     * membership or a pending invitation, so it intentionally uses the same
     * envelope as the batch endpoint.
     */
    async addLeagueMember(
      leagueId: number,
      playerId: number,
      role = 'member',
    ): Promise<LeagueMemberAddResult> {
      const response = await api.post<LeagueMemberAddResult>(
        `/api/leagues/${leagueId}/members`,
        { player_id: playerId, role },
      );
      return response.data;
    },

    async addLeagueMembersBatch(
      leagueId: number,
      playerIds: readonly number[],
    ): Promise<LeagueMemberAddResult> {
      const response = await api.post<LeagueMemberAddResult>(`/api/leagues/${leagueId}/members_batch`, {
        members: playerIds.map((playerId) => ({ player_id: playerId, role: 'member' })),
      });
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

    async createLeagueSeason(leagueId: number, seasonData: Partial<Season> & Record<string, unknown>) {
      const response = await api.post<Season>(`/api/leagues/${leagueId}/seasons`, seasonData);
      return response.data;
    },

    async updateSeason(seasonId: number, seasonData: Partial<Season> & Record<string, unknown>) {
      const response = await api.put<Season>(`/api/seasons/${seasonId}`, seasonData);
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
     * Directly join an open league (no approval required).
     * Maps to POST /api/leagues/{leagueId}/join. The backend 400s if the
     * league is invite-only — callers should use `requestToJoinLeague` instead
     * for invite-only leagues.
     */
    async joinLeague(leagueId: number): Promise<{ success: boolean; message: string }> {
      const response = await api.post<{ success: boolean; message: string }>(
        `/api/leagues/${leagueId}/join`,
      );
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
  };
}
