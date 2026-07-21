import type { AxiosInstance } from "axios";
import type {
  Match,
  MatchMutationResponse,
  GameCreatePayload,
  GameCreateResponse,
} from "@beach-kings/shared";

export function createMatchMethods(api: AxiosInstance) {
  return {
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

    async updateMatch(matchId: number, matchData: Partial<Match>): Promise<MatchMutationResponse> {
      const response = await api.put<MatchMutationResponse>(`/api/matches/${matchId}`, matchData);
      return response.data;
    },

    async deleteMatch(matchId: number): Promise<MatchMutationResponse> {
      const response = await api.delete<MatchMutationResponse>(`/api/matches/${matchId}`);
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
  };
}
