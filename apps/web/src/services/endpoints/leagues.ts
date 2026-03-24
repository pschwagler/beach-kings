/**
 * League endpoints — CRUD, join requests, members, seasons, home courts, league messages.
 */

import api from '../api-client';

/**
 * Create a new league
 */
export const createLeague = async (leagueData) => {
  const response = await api.post('/api/leagues', leagueData);
  return response.data;
};

/**
 * List all leagues
 */
export const listLeagues = async () => {
  const response = await api.get('/api/leagues');
  return response.data;
};

/**
 * Query leagues with filters, ordering, and limit
 */
export const queryLeagues = async (filters = {}, options = {}) => {
  const response = await api.post('/api/leagues/query', filters, options);
  return response.data;
};

// Note: we can derive regions from getLocations response (which now includes region info),
// so a dedicated getRegions helper isn't strictly required for the Find Leagues page.

/**
 * Join a public league
 */
export const joinLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join`);
  return response.data;
};

/**
 * Request to join an invite-only league
 */
export const requestToJoinLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/request-join`);
  return response.data;
};

/**
 * Cancel a pending join request for an invite-only league
 */
export const cancelJoinRequest = async (leagueId) => {
  const response = await api.delete(`/api/leagues/${leagueId}/join-request`);
  return response.data;
};

/**
 * Get pending and rejected join requests for a league (admin only).
 * @returns {Promise<{ pending: Array<{ id: number, player_name: string, created_at: string }>, rejected: Array<...> }>}
 */
export const getLeagueJoinRequests = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/join-requests`);
  const data = response.data;
  return {
    pending: Array.isArray(data?.pending) ? data.pending : [],
    rejected: Array.isArray(data?.rejected) ? data.rejected : []
  };
};

/**
 * Approve a league join request (admin only)
 */
export const approveLeagueJoinRequest = async (leagueId, requestId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join-requests/${requestId}/approve`);
  return response.data;
};

/**
 * Reject a league join request (admin only)
 */
export const rejectLeagueJoinRequest = async (leagueId, requestId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join-requests/${requestId}/reject`);
  return response.data;
};

/**
 * Get a specific league
 */
export const getLeague = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}`);
  return response.data;
};

/**
 * Get seasons for a league
 */
export const getLeagueSeasons = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/seasons`);
  return response.data;
};

/**
 * Get members of a league
 */
export const getLeagueMembers = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/members`);
  return response.data;
};

/**
 * Get leagues for the current authenticated user
 */
export const getUserLeagues = async () => {
  const response = await api.get('/api/users/me/leagues');
  return response.data;
};

/**
 * Add a player to a league
 */
export const addLeagueMember = async (leagueId, playerId, role = 'member') => {
  const response = await api.post(`/api/leagues/${leagueId}/members`, {
    player_id: playerId,
    role
  });
  return response.data;
};

/**
 * Add multiple players to a league in one request.
 * @param {number} leagueId - League ID
 * @param {Array<{ player_id: number, role?: string }>} members - List of { player_id, role } (role defaults to 'member')
 * @returns {Promise<{ added: Array, failed: Array<{ player_id: number, error: string }> }>}
 */
export const addLeagueMembersBatch = async (leagueId, members) => {
  const response = await api.post(`/api/leagues/${leagueId}/members_batch`, {
    members: Array.isArray(members) ? members : [],
  });
  return response.data;
};

/**
 * Remove a member from a league
 */
export const removeLeagueMember = async (leagueId, memberId) => {
  const response = await api.delete(`/api/leagues/${leagueId}/members/${memberId}`);
  return response.data;
};

/**
 * Leave a league
 */
export const leaveLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/leave`);
  return response.data;
};

/**
 * Update a league member's role
 */
export const updateLeagueMember = async (leagueId, memberId, role) => {
  const response = await api.put(`/api/leagues/${leagueId}/members/${memberId}`, {
    role
  });
  return response.data;
};

/**
 * Create a season for a league
 */
export const createLeagueSeason = async (leagueId, seasonData) => {
  const response = await api.post(`/api/leagues/${leagueId}/seasons`, seasonData);
  return response.data;
};

/**
 * Update a season
 */
export const updateSeason = async (seasonId, seasonData) => {
  const response = await api.put(`/api/seasons/${seasonId}`, seasonData);
  return response.data;
};

/**
 * Update a league
 */
export const updateLeague = async (leagueId, leagueData) => {
  const response = await api.put(`/api/leagues/${leagueId}`, leagueData);
  return response.data;
};

/**
 * League Home Courts
 */

/** List home courts for a league. */
export const getLeagueHomeCourts = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/home-courts`);
  return response.data;
};

/** Add a home court to a league. */
export const addLeagueHomeCourt = async (leagueId, courtId) => {
  const response = await api.post(`/api/leagues/${leagueId}/home-courts`, { court_id: courtId });
  return response.data;
};

/** Remove a home court from a league. */
export const removeLeagueHomeCourt = async (leagueId, courtId) => {
  const response = await api.delete(`/api/leagues/${leagueId}/home-courts/${courtId}`);
  return response.data;
};

/** Reorder home courts for a league. */
export const reorderLeagueHomeCourts = async (leagueId, courtPositions) => {
  const response = await api.put(`/api/leagues/${leagueId}/home-courts/reorder`, { court_positions: courtPositions });
  return response.data;
};

/** Set all home courts for a league (replaces existing). */
export const setLeagueHomeCourts = async (leagueId, courtIds) => {
  const response = await api.put(`/api/leagues/${leagueId}/home-courts`, { court_ids: courtIds });
  return response.data;
};

/**
 * Get league messages
 */
export const getLeagueMessages = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/messages`);
  return response.data;
};

/**
 * Create a league message
 */
export const createLeagueMessage = async (leagueId, message) => {
  const response = await api.post(`/api/leagues/${leagueId}/messages`, { message });
  return response.data;
};
