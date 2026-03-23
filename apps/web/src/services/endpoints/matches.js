/**
 * Match endpoints — CRUD, CSV export, partnership/opponent stats.
 */

import api from '../api-client';

/**
 * Get all matches for a season or league with ELO changes
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getMatchesWithElo = async (params) => {
  const response = await api.post('/api/matches/elo', params);
  return response.data;
};

/**
 * Get all matches for a season with ELO changes (backward compatibility)
 */
export const getSeasonMatches = async (seasonId) => {
  return getMatchesWithElo({ season_id: seasonId });
};

/**
 * Get all matches
 */
export const getMatches = async () => {
  const response = await api.get('/api/matches');
  return response.data;
};

/**
 * Query matches with filters (e.g., by league_id, season_id)
 */
export const queryMatches = async (queryParams) => {
  const response = await api.post('/api/matches/search', queryParams);
  return response.data;
};

/**
 * Create a new match
 */
export const createMatch = async (matchData) => {
  const response = await api.post('/api/matches', matchData);
  return response.data;
};

/**
 * Update an existing match
 */
export const updateMatch = async (matchId, matchData) => {
  const response = await api.put(`/api/matches/${matchId}`, matchData);
  return response.data;
};

// Delete an existing match
export const deleteMatch = async (matchId) => {
  const response = await api.delete(`/api/matches/${matchId}`);
  return response.data;
};

/**
 * Export all matches to CSV
 */
export const exportMatchesToCSV = async () => {
  if (typeof window === 'undefined') {
    throw new Error('exportMatchesToCSV can only be called in the browser');
  }

  const response = await api.get('/api/matches/export', {
    responseType: 'blob'
  });

  // Create a download link and trigger it
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'matches_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
