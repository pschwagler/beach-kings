/**
 * Friends endpoints — friend requests, friend list, suggestions, mutual friends, batch status.
 */

import api from '../api-client';
import type { Friend, FriendListResponse, FriendRequest } from '../../types';

/**
 * Send a friend request to another player.
 * @param {number} receiverPlayerId - Player ID to send request to
 */
export const sendFriendRequest = async (receiverPlayerId: number): Promise<FriendRequest> => {
  const response = await api.post('/api/friends/request', {
    receiver_player_id: receiverPlayerId,
  });
  return response.data;
};

/**
 * Accept a pending friend request.
 * @param {number} requestId - Friend request ID
 */
export const acceptFriendRequest = async (requestId: number): Promise<FriendRequest> => {
  const response = await api.post(`/api/friends/requests/${requestId}/accept`);
  return response.data;
};

/**
 * Decline a pending friend request.
 * @param {number} requestId - Friend request ID
 */
export const declineFriendRequest = async (requestId: number): Promise<FriendRequest> => {
  const response = await api.post(`/api/friends/requests/${requestId}/decline`);
  return response.data;
};

/**
 * Cancel an outgoing friend request.
 * @param {number} requestId - Friend request ID
 */
export const cancelFriendRequest = async (requestId: number): Promise<{ message: string }> => {
  const response = await api.delete(`/api/friends/requests/${requestId}`);
  return response.data;
};

/**
 * Remove a friend (unfriend).
 * @param {number} playerId - Player ID to unfriend
 */
export const removeFriend = async (playerId: number): Promise<{ message: string }> => {
  const response = await api.delete(`/api/friends/${playerId}`);
  return response.data;
};

/**
 * Get current user's friends list (paginated).
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Items per page
 */
export const getFriends = async (page: number = 1, pageSize: number = 50): Promise<FriendListResponse> => {
  const response = await api.get('/api/friends', {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

/**
 * Get pending friend requests.
 * @param {string} direction - "incoming", "outgoing", or "both"
 */
export const getFriendRequests = async (direction: string = 'both'): Promise<FriendRequest[]> => {
  const response = await api.get('/api/friends/requests', {
    params: { direction },
  });
  return response.data;
};

/**
 * Get friend suggestions based on shared leagues.
 * @param {number} limit - Max suggestions
 */
export const getFriendSuggestions = async (limit: number = 10) => {
  const response = await api.get('/api/friends/suggestions', {
    params: { limit },
  });
  return response.data;
};

/**
 * Get friend status for multiple player IDs (for search results/player cards).
 * @param {number[]} playerIds - Player IDs to check
 * @returns {Promise<{statuses: Object, mutual_counts: Object}>}
 */
export const batchFriendStatus = async (playerIds: number[]) => {
  const response = await api.post('/api/friends/batch-status', {
    player_ids: playerIds,
  });
  return response.data;
};

/**
 * Get mutual friends between current user and another player.
 * @param {number} otherPlayerId - Other player's ID
 */
export const getMutualFriends = async (otherPlayerId: number) => {
  const response = await api.get(`/api/friends/mutual/${otherPlayerId}`);
  return response.data;
};
