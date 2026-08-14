import type { AxiosInstance } from 'axios';
import type {
  ConversationListResponse,
  DirectMessage,
  MarkReadResponse,
  ThreadResponse,
} from '@beach-kings/shared';

/** API methods for the Direct message domain. */
export function createMessageMethods(api: AxiosInstance) {
  return {

    // -----------------------------------------------------------------------
    // Direct Messages
    // -----------------------------------------------------------------------

    /**
     * Get the current user's conversation list, ordered by most recent.
     */
    async getConversations(page = 1, pageSize = 50): Promise<ConversationListResponse> {
      const response = await api.get<ConversationListResponse>(
        '/api/messages/conversations',
        { params: { page, page_size: pageSize } },
      );
      return response.data;
    },

    /**
     * Get messages in a thread with a specific player (newest first).
     */
    async getThread(
      playerId: number,
      page = 1,
      pageSize = 50,
    ): Promise<ThreadResponse> {
      const response = await api.get<ThreadResponse>(
        `/api/messages/conversations/${encodeURIComponent(playerId)}`,
        { params: { page, page_size: pageSize } },
      );
      return response.data;
    },

    /**
     * Send a direct message to another player.
     */
    async sendDirectMessage(
      receiverPlayerId: number,
      messageText: string,
    ): Promise<DirectMessage> {
      const response = await api.post<DirectMessage>('/api/messages/send', {
        receiver_player_id: receiverPlayerId,
        message_text: messageText,
      });
      return response.data;
    },

    /**
     * Mark all messages from a specific player as read.
     */
    async markThreadRead(
      playerId: number,
    ): Promise<MarkReadResponse> {
      const response = await api.put<MarkReadResponse>(
        `/api/messages/conversations/${encodeURIComponent(playerId)}/read`,
      );
      return response.data;
    },

    /**
     * Get total unread DM count across all conversations.
     */
    async getDmUnreadCount(): Promise<{ count: number }> {
      const response = await api.get<{ count: number }>(
        '/api/messages/unread-count',
      );
      return response.data;
    },
  };
}
