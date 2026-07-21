import type { AxiosInstance } from 'axios';
import type {
  League,
  LeagueSignupsApiResponse,
  FindLeagueResult,
  LeagueQueryResponse,
} from '@beach-kings/shared';

/** API methods for the Season signup and league signup domain. */
export function createSignupMethods(api: AxiosInstance) {
  return {

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
  };
}
