import type { AxiosInstance } from 'axios';
import { getRead, type ReadRequestOptions } from './readRequest';
import type {
  ConversationListResponse,
  DirectMessage,
  MarkReadResponse,
  MessageFolder,
  ConversationVisibilityResponse,
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
    async getConversations(
      page = 1,
      pageSize = 50,
      folder: MessageFolder = 'inbox',
      options?: ReadRequestOptions,
    ): Promise<ConversationListResponse> {
      const response = await getRead<ConversationListResponse>(api,
        '/api/messages/conversations',
        { params: { page, page_size: pageSize, folder } },
        options,
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
      options?: ReadRequestOptions,
    ): Promise<ThreadResponse> {
      const response = await getRead<ThreadResponse>(api,
        `/api/messages/conversations/${encodeURIComponent(playerId)}`,
        { params: { page, page_size: pageSize } },
        options,
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

    /** Hide or restore one conversation for the current player. */
    async setConversationHidden(
      playerId: number,
      hidden: boolean,
    ): Promise<ConversationVisibilityResponse> {
      const response = await api.put<ConversationVisibilityResponse>(
        `/api/messages/conversations/${encodeURIComponent(playerId)}/visibility`,
        { hidden },
      );
      return response.data;
    },

    /**
     * Get total unread DM count across all conversations.
     */
    async getDmUnreadCount(options?: ReadRequestOptions): Promise<{ count: number }> {
      const response = await getRead<{ count: number }>(api,
        '/api/messages/unread-count',
        undefined, options,
      );
      return response.data;
    },
  };
}
