/**
 * Session endpoints — CRUD, join, invite, lock-in, participants.
 */

import api from '../api-client';

/**
 * Get all sessions for a league
 * @param {number} leagueId - ID of the league
 * @returns {Promise<Array>} Array of session objects
 */
export const getSessions = async (leagueId: number) => {
  if (!leagueId) {
    throw new Error('leagueId is required');
  }
  const response = await api.get(`/api/leagues/${leagueId}/sessions`);
  return response.data;
};

/**
 * Get active session for a league (helper function that filters client-side)
 * @param {number} leagueId - ID of the league
 * @returns {Promise<Object|null>} Active session object or null if none found
 */
export const getActiveSession = async (leagueId: number) => {
  if (!leagueId) {
    return null;
  }
  // Fetch all sessions and filter for active one on the frontend
  const sessions = await getSessions(leagueId);
  const activeSession = sessions.find((session: { status?: string }) => session.status === 'ACTIVE');
  return activeSession || null;
};

/**
 * Get sessions for the current user (creator, has match, or invited).
 * @param {Object} [options]
 * @param {boolean} [options.includeAll=false] - When true, returns all statuses (not just ACTIVE).
 * @returns {Promise<Array>} Array of session objects with participation, match_count, etc.
 */
export const getOpenSessions = async ({ includeAll = false } = {}) => {
  const params = includeAll ? { include_all: true } : {};
  const response = await api.get('/api/sessions/open', { params });
  return response.data;
};

/**
 * Get a session by its shareable code.
 * @param {string} code - Session code
 * @returns {Promise<Object>} Session object
 */
export const getSessionByCode = async (code: string) => {
  const response = await api.get(`/api/sessions/by-code/${encodeURIComponent(code)}`);
  return response.data;
};

/**
 * Get all matches for a session.
 * @param {number} sessionId - Session ID
 * @returns {Promise<Array>} Array of match objects
 */
export const getSessionMatches = async (sessionId: number) => {
  const response = await api.get(`/api/sessions/${sessionId}/matches`);
  return response.data;
};

/**
 * Get list of players in a session (participants + players who have matches).
 */
export const getSessionParticipants = async (sessionId: number) => {
  const response = await api.get(`/api/sessions/${sessionId}/participants`);
  return response.data;
};

/**
 * Remove a player from session participants. Fails if player has matches in this session.
 */
export const removeSessionParticipant = async (sessionId: number, playerId: number) => {
  const response = await api.delete(`/api/sessions/${sessionId}/participants/${playerId}`);
  return response.data;
};

/**
 * Join a session by code (adds current user's player to participants).
 * @param {string} code - Session code
 * @returns {Promise<Object>} { status, message, session }
 */
export const joinSessionByCode = async (code: string) => {
  const response = await api.post('/api/sessions/join', { code: code.trim().toUpperCase() });
  return response.data;
};

/**
 * Invite a player to a session.
 * @param {number} sessionId - Session ID
 * @param {number} playerId - Player ID to invite
 * @returns {Promise<Object>} { status, message }
 */
export const inviteToSession = async (sessionId: number, playerId: number) => {
  const response = await api.post(`/api/sessions/${sessionId}/invite`, { player_id: playerId });
  return response.data;
};

/**
 * Invite multiple players to a session in one request.
 * @param {number} sessionId - Session ID
 * @param {number[]} playerIds - Player IDs to invite
 * @returns {Promise<{ added: number[], failed: { player_id: number, error: string }[] }>}
 */
export const inviteToSessionBatch = async (sessionId: number, playerIds: number[]) => {
  const response = await api.post(`/api/sessions/${sessionId}/invite_batch`, {
    player_ids: Array.isArray(playerIds) ? playerIds : [],
  });
  return response.data;
};

/**
 * Create a new non-league session (with shareable code).
 * @param {Object} payload - { date?, name?, court_id? } – pass { date: '...' } for a specific date
 * @returns {Promise<Object>} { status, message, session } with session.code
 */
export const createSession = async (payload: Record<string, any> = {}) => {
  const response = await api.post('/api/sessions', { ...payload });
  return response.data;
};

/**
 * Lock in a session (submit session)
 */
export const lockInSession = async (sessionId: number) => {
  const response = await api.patch(`/api/sessions/${sessionId}`, { submit: true });
  return response.data;
};

/**
 * Lock in a league session (submit session)
 */
export const lockInLeagueSession = async (leagueId: number, sessionId: number) => {
  const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
  return response.data;
};

/**
 * Delete a session
 */
export const deleteSession = async (sessionId: number) => {
  const response = await api.delete(`/api/sessions/${sessionId}`);
  return response.data;
};

/**
 * Update a session's fields (name, date, season_id)
 * @param {number} sessionId - ID of session to update
 * @param {Object} updates - Object with optional fields: name, date, season_id
 * @returns {Promise} Updated session data
 */
export const updateSession = async (sessionId: number, updates: Record<string, any>) => {
  const response = await api.patch(`/api/sessions/${sessionId}`, updates);
  return response.data;
};

/**
 * Update a session's season_id (convenience function)
 * @param {number} sessionId - ID of session to update
 * @param {number|null} seasonId - New season_id (can be null to remove season)
 * @returns {Promise} Updated session data
 */
export const updateSessionSeason = async (sessionId: number, seasonId: number | null) => {
  return updateSession(sessionId, { season_id: seasonId });
};
