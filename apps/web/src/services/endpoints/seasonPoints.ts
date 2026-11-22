import api from '../api-client';
import type { SeasonPointsData } from '@beach-kings/shared';
export async function getSeasonPoints(leagueId: number, seasonId: number, signal: AbortSignal): Promise<SeasonPointsData> {
  return (await api.get<SeasonPointsData>(`/api/leagues/${leagueId}/seasons/${seasonId}/points-history`, {signal})).data;
}
