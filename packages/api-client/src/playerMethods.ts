import type { AxiosInstance } from "axios";
import type {
  Player,
  PlayerSearchResponse,
  CreatePlaceholderRequest,
  PlaceholderPlayerResponse,
  PlayerLeague,
  PublicPlayerResponse,
} from "@beach-kings/shared";

/**
 * Maps a public player profile response (GET /api/public/players/{id}) onto the
 * flat {@link Player} shape consumed by the mobile profile screen.
 *
 * The public endpoint nests rating/games under `stats` and the home-location
 * record under `location`, whereas the profile header + stats grid read them as
 * top-level Player fields. This adapter bridges that gap (and mirrors how the
 * web PublicPlayerPage consumes the same endpoint). City/state prefer the
 * player's own top-level fields, falling back to the home location's.
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
    city: res.city ?? res.location?.city ?? null,
    state: res.state ?? res.location?.state ?? null,
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

export function createPlayerMethods(api: AxiosInstance) {
  return {
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
  };
}
