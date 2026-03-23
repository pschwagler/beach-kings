/**
 * Direct messaging endpoints — conversations, threads, send, mark read, unread count.
 */

import api from '../api-client';

/**
 * Get conversation list for the current user.
 * @param {number} [page=1] - Page number
 * @param {number} [pageSize=50] - Items per page
 */
export const getConversations = async (page = 1, pageSize = 50) => {
  const response = await api.get('/api/messages/conversations', {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

/**
 * Get messages in a thread with a specific player (newest first).
 * @param {number} playerId - Other player's ID
 * @param {number} [page=1] - Page number
 * @param {number} [pageSize=50] - Items per page
 */
export const getThread = async (playerId, page = 1, pageSize = 50) => {
  const response = await api.get(`/api/messages/conversations/${playerId}`, {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

/**
 * Send a direct message to a friend.
 * @param {number} receiverPlayerId - Recipient player ID
 * @param {string} messageText - Message content (1-500 chars)
 */
export const sendMessage = async (receiverPlayerId, messageText) => {
  const response = await api.post('/api/messages/send', {
    receiver_player_id: receiverPlayerId,
    message_text: messageText,
  });
  return response.data;
};

/**
 * Mark all messages from a specific player as read.
 * @param {number} playerId - Player whose messages to mark read
 */
export const markThreadRead = async (playerId) => {
  const response = await api.put(`/api/messages/conversations/${playerId}/read`);
  return response.data;
};

/**
 * Get total unread message count across all conversations.
 */
export const getUnreadMessageCount = async () => {
  const response = await api.get('/api/messages/unread-count');
  return response.data;
};
