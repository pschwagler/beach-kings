/**
 * Player endpoints — CRUD, stats, rankings, ELO timeline, match history, home courts.
 */

import api from '../api-client';

/**
 * Query rankings with filters (e.g., by season_id)
 */
export const getRankings = async (queryParams = {}) => {
  const response = await api.post('/api/rankings', queryParams);
  return response.data;
};

/**
 * Get players with optional search and filters. Supports multi-select filters via arrays.
 * @param {Object} params - q, location_id (string or string[]), league_id (number or number[]),
 *   gender (string or string[]), level (string or string[]), limit, offset
 */
export const getPlayers = async (params = {}, { signal } = {}) => {
  const {
    q,
    location_id,
    league_id,
    gender,
    level,
    limit = 50,
    offset = 0,
    include_placeholders = true,
  } = params;
  const searchParams = new URLSearchParams();
  if (q != null && q !== '') searchParams.set('q', String(q));
  const locationIds = Array.isArray(location_id) ? location_id : (location_id != null && location_id !== '' ? [location_id] : []);
  locationIds.forEach((id) => searchParams.append('location_id', String(id)));
  const leagueIds = Array.isArray(league_id) ? league_id : (league_id != null && league_id !== '' ? [Number(league_id)] : []);
  leagueIds.forEach((id) => searchParams.append('league_id', String(id)));
  const genders = Array.isArray(gender) ? gender : (gender != null && gender !== '' ? [gender] : []);
  genders.forEach((g) => searchParams.append('gender', String(g)));
  const levels = Array.isArray(level) ? level : (level != null && level !== '' ? [level] : []);
  levels.forEach((l) => searchParams.append('level', String(l)));
  searchParams.set('limit', String(limit));
  searchParams.set('offset', String(offset));
  if (include_placeholders) searchParams.set('include_placeholders', 'true');
  const response = await api.get(`/api/players?${searchParams.toString()}`, { signal });
  return response.data;
};

/**
 * Create a new player
 */
export const createPlayer = async (name) => {
  const response = await api.post('/api/players', { name });
  return response.data;
};

/**
 * Get detailed stats for a specific player
 * @param {number} playerId
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
 */
export const getPlayerStats = async (playerId, { signal } = {}) => {
  const response = await api.get(`/api/players/${playerId}/stats`, { signal });
  return response.data;
};

/**
 * Get player stats for a specific season
 */
export const getPlayerSeasonStats = async (playerId, seasonId) => {
  const response = await api.get(`/api/players/${playerId}/season/${seasonId}/stats`);
  return response.data;
};

/**
 * Get all player stats for a season or league
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getAllPlayerStats = async (params) => {
  const response = await api.post('/api/player-stats', params);
  return response.data;
};

/**
 * Get all player season stats for a season (backward compatibility)
 */
export const getAllPlayerSeasonStats = async (seasonId) => {
  return getAllPlayerStats({ season_id: seasonId });
};

/**
 * Get partnership and opponent stats for a player in a season
 */
export const getPlayerSeasonPartnershipOpponentStats = async (playerId, seasonId) => {
  const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a season or league
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getAllPartnershipOpponentStats = async (params) => {
  const response = await api.post('/api/partnership-opponent-stats', params);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a season (backward compatibility)
 */
export const getAllSeasonPartnershipOpponentStats = async (seasonId) => {
  return getAllPartnershipOpponentStats({ season_id: seasonId });
};

/**
 * Get player stats for a specific league
 */
export const getPlayerLeagueStats = async (playerId, leagueId) => {
  const response = await api.get(`/api/players/${playerId}/league/${leagueId}/stats`);
  return response.data;
};

/**
 * Get all player league stats for a league (backward compatibility)
 */
export const getAllPlayerLeagueStats = async (leagueId) => {
  return getAllPlayerStats({ league_id: leagueId });
};

/**
 * Get partnership and opponent stats for a player in a league
 */
export const getPlayerLeaguePartnershipOpponentStats = async (playerId, leagueId) => {
  const response = await api.get(`/api/players/${playerId}/league/${leagueId}/partnership-opponent-stats`);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a league (backward compatibility)
 */
export const getAllLeaguePartnershipOpponentStats = async (leagueId) => {
  return getAllPartnershipOpponentStats({ league_id: leagueId });
};

/**
 * Get ELO timeline for all players
 */
export const getEloTimeline = async () => {
  const response = await api.get('/api/elo-timeline');
  return response.data;
};

/**
 * Get match history for a specific player
 * @param {number} playerId
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
 */
export const getPlayerMatchHistory = async (playerId, { signal } = {}) => {
  const response = await api.get(`/api/players/${playerId}/matches`, { signal });
  return response.data;
};

/**
 * Search publicly visible players with optional filters.
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.search] - Search by player name
 * @param {string} [params.location_id] - Filter by location ID
 * @param {string} [params.gender] - Filter by gender
 * @param {string} [params.level] - Filter by skill level
 * @param {number} [params.page] - Page number (1-based)
 * @param {number} [params.page_size] - Items per page
 * @returns {Promise<{items: Array, total_count: number}>}
 */
export const getPublicPlayers = async (params = {}, options = {}) => {
  const response = await api.get('/api/public/players', { params, ...options });
  return response.data;
};

/**
 * Player Home Courts
 */

/** List home courts for a player. */
export const getPlayerHomeCourts = async (playerId) => {
  const response = await api.get(`/api/players/${playerId}/home-courts`);
  return response.data;
};

/** Add a home court to a player. */
export const addPlayerHomeCourt = async (playerId, courtId) => {
  const response = await api.post(`/api/players/${playerId}/home-courts`, { court_id: courtId });
  return response.data;
};

/** Remove a home court from a player. */
export const removePlayerHomeCourt = async (playerId, courtId) => {
  const response = await api.delete(`/api/players/${playerId}/home-courts/${courtId}`);
  return response.data;
};

/** Reorder home courts for a player. */
export const reorderPlayerHomeCourts = async (playerId, courtPositions) => {
  const response = await api.put(`/api/players/${playerId}/home-courts/reorder`, { court_positions: courtPositions });
  return response.data;
};

/** Set all home courts for a player (replaces existing). */
export const setPlayerHomeCourts = async (playerId, courtIds) => {
  const response = await api.put(`/api/players/${playerId}/home-courts`, { court_ids: courtIds });
  return response.data;
};
