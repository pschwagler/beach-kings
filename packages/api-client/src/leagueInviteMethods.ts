import type { AxiosInstance } from 'axios';
import type {
  League,
  InvitablePlayer,
  LeagueInviteItem,
  InviteActionResponse,
} from '@beach-kings/shared';

/** API methods for the League invite domain. */
export function createLeagueInviteMethods(api: AxiosInstance) {
  return {

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
  };
}
