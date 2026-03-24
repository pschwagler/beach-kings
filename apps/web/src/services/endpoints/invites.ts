/**
 * Invite endpoints — placeholder players, invite URLs, claim invite.
 */

import api from '../api-client';

/**
 * Create a placeholder player with an invite link.
 * @param {Object} data - { name: string, phone_number?: string, league_id?: number }
 * @returns {Promise<{ player_id: number, name: string, invite_token: string, invite_url: string }>}
 */
export const createPlaceholderPlayer = async (data) => {
  const response = await api.post('/api/players/placeholder', data);
  return response.data;
};

/**
 * List placeholder players created by the current user.
 * @returns {Promise<{ placeholders: Array<{ player_id, name, phone_number, match_count, invite_token, invite_url, status, created_at }> }>}
 */
export const listPlaceholderPlayers = async () => {
  const response = await api.get('/api/players/placeholder');
  return response.data;
};

/**
 * Delete a placeholder player (replaces with Unknown Player in matches).
 * @param {number} playerId - Placeholder player ID
 * @returns {Promise<{ affected_matches: number }>}
 */
export const deletePlaceholderPlayer = async (playerId) => {
  const response = await api.delete(`/api/players/placeholder/${playerId}`);
  return response.data;
};

/**
 * Get the invite URL for a placeholder player.
 * @param {number} playerId - Placeholder player ID
 * @returns {Promise<{ invite_url: string }>}
 */
export const getPlayerInviteUrl = async (playerId) => {
  const response = await api.get(`/api/players/${playerId}/invite-url`);
  return response.data;
};

/**
 * Get invite details for landing page (public endpoint).
 * @param {string} token - Invite token
 * @returns {Promise<{ inviter_name, placeholder_name, match_count, league_names, status }>}
 */
export const getInviteDetails = async (token) => {
  const response = await api.get(`/api/invites/${encodeURIComponent(token)}`);
  return response.data;
};

/**
 * Claim an invite (link placeholder to current user).
 * @param {string} token - Invite token
 * @returns {Promise<{ success, message, player_id, warnings, redirect_url }>}
 */
export const claimInvite = async (token) => {
  const response = await api.post(`/api/invites/${encodeURIComponent(token)}/claim`);
  return response.data;
};
