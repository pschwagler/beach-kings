/**
 * KOB (King/Queen of the Beach) tournament endpoints — CRUD, bracket ops.
 */

import api, { API_BASE_URL } from '../api-client';

/**
 * Create a new KOB tournament.
 * @param {Object} data - Tournament config
 */
export const createKobTournament = async (data) => {
  const response = await api.post('/api/kob/tournaments', data);
  return response.data;
};

/**
 * Get tournaments directed by or participated in by current user.
 */
export const getMyKobTournaments = async () => {
  const response = await api.get('/api/kob/tournaments/mine');
  return response.data;
};

/**
 * Get tournament detail by ID (director view).
 * @param {number} tournamentId
 */
export const getKobTournament = async (tournamentId) => {
  const response = await api.get(`/api/kob/tournaments/${tournamentId}`);
  return response.data;
};

/**
 * Update tournament config (pre-start only).
 * @param {number} tournamentId
 * @param {Object} data
 */
export const updateKobTournament = async (tournamentId, data) => {
  const response = await api.patch(`/api/kob/tournaments/${tournamentId}`, data);
  return response.data;
};

/**
 * Delete a KOB tournament.
 * @param {number} tournamentId
 */
export const deleteKobTournament = async (tournamentId) => {
  await api.delete(`/api/kob/tournaments/${tournamentId}`);
};

/**
 * Add a player to a KOB tournament roster.
 * @param {number} tournamentId
 * @param {Object} data - { player_id, seed? }
 */
export const addKobPlayer = async (tournamentId, data) => {
  const response = await api.post(`/api/kob/tournaments/${tournamentId}/players`, data);
  return response.data;
};

/**
 * Remove a player from a KOB tournament roster.
 * @param {number} tournamentId
 * @param {number} playerId
 */
export const removeKobPlayer = async (tournamentId, playerId) => {
  const response = await api.delete(`/api/kob/tournaments/${tournamentId}/players/${playerId}`);
  return response.data;
};

/**
 * Reorder player seeds.
 * @param {number} tournamentId
 * @param {number[]} playerIds - Ordered list (position = seed)
 */
export const reorderKobSeeds = async (tournamentId, playerIds) => {
  const response = await api.put(`/api/kob/tournaments/${tournamentId}/seeds`, { player_ids: playerIds });
  return response.data;
};

/**
 * Start a KOB tournament (lock roster, generate schedule).
 * @param {number} tournamentId
 */
export const startKobTournament = async (tournamentId) => {
  const response = await api.post(`/api/kob/tournaments/${tournamentId}/start`);
  return response.data;
};

/**
 * Manually advance to the next round.
 * @param {number} tournamentId
 */
export const advanceKobRound = async (tournamentId) => {
  const response = await api.post(`/api/kob/tournaments/${tournamentId}/advance`);
  return response.data;
};

/**
 * Drop a player mid-tournament.
 * @param {number} tournamentId
 * @param {number} playerId
 */
export const dropKobPlayer = async (tournamentId, playerId) => {
  const response = await api.post(`/api/kob/tournaments/${tournamentId}/drop-player`, { player_id: playerId });
  return response.data;
};

/**
 * Director score edit/override.
 * @param {number} tournamentId
 * @param {string} matchupId
 * @param {Object} data - { team1_score, team2_score }
 */
export const editKobScore = async (tournamentId, matchupId, data) => {
  const response = await api.patch(`/api/kob/tournaments/${tournamentId}/matches/${matchupId}`, data);
  return response.data;
};

/**
 * Manually complete a tournament.
 * @param {number} tournamentId
 */
export const completeKobTournament = async (tournamentId) => {
  const response = await api.post(`/api/kob/tournaments/${tournamentId}/complete`);
  return response.data;
};

/**
 * Get format recommendation.
 * @param {number} numPlayers
 * @param {number} numCourts
 * @param {number} [durationMinutes]
 */
export const getKobFormatRecommendation = async ({
  numPlayers, numCourts, format, numPools, playoffSize, maxRounds,
  gamesPerMatch, numRrCycles, gameTo, durationMinutes,
  playoffFormat, playoffGameTo, playoffGamesPerMatch,
}) => {
  const params = { num_players: numPlayers, num_courts: numCourts };
  if (format) params.format = format;
  if (numPools) params.num_pools = numPools;
  if (playoffSize != null) params.playoff_size = playoffSize;
  if (maxRounds) params.max_rounds = maxRounds;
  if (gamesPerMatch > 1) params.games_per_match = gamesPerMatch;
  if (numRrCycles > 1) params.num_rr_cycles = numRrCycles;
  if (gameTo && gameTo !== 21) params.game_to = gameTo;
  if (durationMinutes) params.duration_minutes = durationMinutes;
  if (playoffFormat) params.playoff_format = playoffFormat;
  if (playoffGameTo) params.playoff_game_to = playoffGameTo;
  if (playoffGamesPerMatch) params.playoff_games_per_match = playoffGamesPerMatch;
  const response = await api.get('/api/kob/recommend', { params });
  return response.data;
};

/**
 * Get format recommendation pills for quick format switching.
 * @param {Object} params
 * @param {number} params.numPlayers
 * @param {number} params.numCourts
 * @param {number} [params.durationMinutes]
 * @returns {Promise<Array>} Array of pill recommendation objects.
 */
export const getKobFormatPills = async ({ numPlayers, numCourts, durationMinutes }) => {
  const params = { num_players: numPlayers, num_courts: numCourts };
  if (durationMinutes) params.duration_minutes = durationMinutes;
  const response = await api.get('/api/kob/recommend/pills', { params });
  return response.data;
};

/**
 * Update bracket match team assignments (director only).
 * @param {number} tournamentId
 * @param {number} matchId - KobMatch.id
 * @param {number[]} team1 - [player_id, player_id]
 * @param {number[]} team2 - [player_id, player_id]
 */
export const updateKobBracketMatch = async (tournamentId, matchId, team1, team2) => {
  const response = await api.patch(`/api/kob/tournaments/${tournamentId}/bracket`, {
    match_id: matchId,
    team1,
    team2,
  });
  return response.data;
};

// --- Public KOB routes (no auth) ---

/**
 * Get tournament by shareable code (public, no auth).
 * Uses raw fetch to avoid auth interceptors.
 * @param {string} code - Tournament code (e.g. "KOB-A3X9R2")
 */
export const getKobTournamentByCode = async (code) => {
  const baseUrl = API_BASE_URL || '';
  const res = await fetch(`${baseUrl}/api/kob/${code}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch tournament: ${res.status}`);
  }
  return res.json();
};

/**
 * Submit a score publicly (no auth).
 * @param {string} code - Tournament code
 * @param {string} matchupId - Match identifier
 * @param {Object} data - { team1_score, team2_score, game_index? }
 */
export const submitKobScorePublic = async (code, matchupId, data) => {
  const baseUrl = API_BASE_URL || '';
  const res = await fetch(`${baseUrl}/api/kob/${code}/score?matchup_id=${matchupId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to submit score: ${res.status}`);
  }
  return res.json();
};
