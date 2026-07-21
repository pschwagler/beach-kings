import type { AxiosInstance } from 'axios';
import type {
  Player,
  MyStatsPayload,
  MyGamesQueryParams,
  MyGamesResponse,
  UserMeResponse,
  StatusResponse,
  UserUpdateRequest,
} from '@beach-kings/shared';

/** API methods for the User domain. */
export function createUserMethods(api: AxiosInstance) {
  return {

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
  };
}
