/**
 * Data hook for the Message Thread (DM conversation) screen.
 *
 * Fetches messages for a thread with a specific player,
 * and manages the send-message form state.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium, hapticError } from '@/utils/haptics';
import type { DirectMessage } from '@beach-kings/shared';

export interface UseMessageThreadScreenResult {
  readonly messages: readonly DirectMessage[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly messageText: string;
  readonly setMessageText: (text: string) => void;
  readonly isSending: boolean;
  readonly sendError: string | null;
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

  const { data, isLoading, error, refetch, mutate } = useApi<{
    items: DirectMessage[];
    total_count: number;
    has_more?: boolean;
  }>(
    () => api.getThread(playerId),
    [playerId],
  );

  const messages = data?.items ?? [];

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onSend = useCallback(async () => {
    const text = messageText.trim();
    if (text === '') return;

    void hapticMedium();
    setIsSending(true);
    setSendError(null);

    try {
      const newMsg = await api.sendDirectMessage(playerId, text);
      setMessageText('');
      // Optimistically prepend the new message (thread newest-first).
      mutate({
        items: [newMsg, ...(data?.items ?? [])],
        total_count: (data?.total_count ?? 0) + 1,
        has_more: data?.has_more,
      });
    } catch {
      void hapticError();
      setSendError('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [messageText, playerId, data, mutate]);

  return {
    messages,
    isLoading,
    error,
    isRefreshing,
    messageText,
    setMessageText,
    isSending,
    sendError,
    onRefresh,
    onRetry,
    onSend,
  };
}
