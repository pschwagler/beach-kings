/**
 * Awards endpoints — season/league/player awards.
 */

import api from '../api-client';
import type { SeasonAward } from '../../types';

/**
 * Get awards for a season (lazy-computes if season has ended).
 * @param {number} seasonId
 */
export const getSeasonAwards = async (seasonId: number): Promise<SeasonAward[]> => {
  const response = await api.get(`/api/seasons/${seasonId}/awards`);
  return response.data;
};

/**
 * Get all awards across all seasons in a league.
 * @param {number} leagueId
 */
export const getLeagueAwards = async (leagueId: number): Promise<SeasonAward[]> => {
  const response = await api.get(`/api/leagues/${leagueId}/awards`);
  return response.data;
};

/**
 * Get all awards for a player across leagues.
 * @param {number} playerId
 */
export const getPlayerAwards = async (playerId: number): Promise<SeasonAward[]> => {
  const response = await api.get(`/api/players/${playerId}/awards`);
  return response.data;
};
