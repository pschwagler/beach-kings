/**
 * Data hook for the Message Thread (DM conversation) screen.
 *
 * Fetches messages for a thread with a specific player,
 * and manages the send-message form state.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  messageKeys,
  messageQueries,
  useMessageMutations,
} from '@/features/messages';
import { hapticMedium, hapticError } from '@/utils/haptics';
import { getApiErrorMessage } from '@/lib/apiError';
import type {
  ConversationListResponse,
  DirectMessage,
} from '@beach-kings/shared';

const EMPTY_MESSAGES: readonly DirectMessage[] = [];

export interface UseMessageThreadScreenResult {
  readonly messages: readonly DirectMessage[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly messageText: string;
  readonly setMessageText: (text: string) => void;
  readonly isSending: boolean;
  readonly sendError: string | null;
  readonly peerName: string | null;
  readonly peerAvatarUrl: string | null;
  readonly canInteract: boolean;
  readonly blockedByViewer: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onSend: () => Promise<void>;
}

/**
 * Returns data and send-form state for the message thread screen.
 *
 * @param playerId - The player ID whose thread is being viewed.
 */
export function useMessageThreadScreen(
  playerId: number,
): UseMessageThreadScreenResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const threadQuery = useQuery(messageQueries.thread(userId, playerId));
  const peerQuery = useQuery(messageQueries.peer(userId, playerId));
  const { markThreadRead, sendMessage } = useMessageMutations();
  const messages = threadQuery.data?.items ?? EMPTY_MESSAGES;
  const attemptedReadSignature = useRef<string | null>(null);

  const unreadSignature = useMemo(() => {
    const unreadMessageIds = messages
      .filter((message) =>
        message.sender_player_id === playerId && !message.is_read
      )
      .map((message) => message.id)
      .sort((a, b) => a - b);
    const conversationUnread =
      queryClient.getQueryData<ConversationListResponse>(
        messageKeys.conversations(userId),
      )?.items.find((conversation) => conversation.player_id === playerId)
        ?.unread_count ?? 0;
    if (unreadMessageIds.length === 0 && conversationUnread === 0) return null;
    return `${playerId}:${conversationUnread}:${unreadMessageIds.join(',')}`;
  }, [messages, playerId, queryClient, userId]);

  useEffect(() => {
    if (
      unreadSignature == null ||
      attemptedReadSignature.current === unreadSignature ||
      markThreadRead.isPending
    ) {
      return;
    }
    attemptedReadSignature.current = unreadSignature;
    markThreadRead.mutate(playerId);
  }, [markThreadRead, playerId, unreadSignature]);

  const onRefresh = useCallback(() => {
    attemptedReadSignature.current = null;
    setIsRefreshing(true);
    threadQuery.refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [threadQuery]);

  const onRetry = useCallback(() => {
    attemptedReadSignature.current = null;
    void threadQuery.refetch();
  }, [threadQuery]);

  const onSend = useCallback(async () => {
    const text = messageText.trim();
    if (text === '') return;

    void hapticMedium();
    setIsSending(true);
    setSendError(null);

    try {
      await sendMessage.mutateAsync({ playerId, text });
      setMessageText('');
    } catch (error) {
      void hapticError();
      setSendError(getApiErrorMessage(error, 'Failed to send message. Please try again.'));
    } finally {
      setIsSending(false);
    }
  }, [messageText, playerId, sendMessage]);

  return {
    messages,
    isLoading: threadQuery.isPending,
    error: threadQuery.error,
    isRefreshing,
    messageText,
    setMessageText,
    isSending,
    sendError,
    peerName: peerQuery.data?.full_name ?? null,
    peerAvatarUrl: peerQuery.data?.profile_picture_url ?? null,
    canInteract: threadQuery.data?.capability?.actions.direct_message ?? true,
    blockedByViewer: threadQuery.data?.capability?.blocked_by_viewer ?? false,
    onRefresh,
    onRetry,
    onSend,
  };
}
