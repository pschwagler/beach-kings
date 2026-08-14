import type { AxiosInstance } from "axios";

export function createRankingMethods(api: AxiosInstance) {
  return {
    async getRankings(queryParams: Record<string, unknown> = {}) {
      const response = await api.post('/api/rankings', queryParams);
      return response.data;
    },

    async getEloTimeline() {
      const response = await api.get('/api/elo-timeline');
      return response.data;
    },
  };
}
