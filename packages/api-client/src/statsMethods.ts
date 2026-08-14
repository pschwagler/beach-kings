import type { AxiosInstance } from 'axios';
import type { StatsCalculationJobStatus } from '@beach-kings/shared';

/** API methods for the asynchronous derived-stat calculation queue. */
export function createStatsMethods(api: AxiosInstance) {
  return {
    async getStatsCalculationStatus(jobId: number): Promise<StatsCalculationJobStatus> {
      const response = await api.get<StatsCalculationJobStatus>(
        `/api/calculate-stats/status/${jobId}`,
      );
      return response.data;
    },
  };
}
