/**
 * Data hook for the Messages inbox screen.
 *
 * Fetches the current user's conversation list.
 * Provides search/filter over the loaded conversations client-side.
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticLight } from '@/utils/haptics';
import type { Conversation, Player } from '@beach-kings/shared';

export interface UseMessagesScreenResult {
  readonly conversations: readonly Conversation[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onConversationPress: (playerId: number, name?: string) => void;
  /** The current user's player ID, or 0 if not yet loaded. */
  readonly currentPlayerId: number;
}

export function useMessagesScreen(): UseMessagesScreenResult {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch } = useApi<{ items: Conversation[]; total_count: number }>(
    () => api.getConversations(),
    [],
  );

  const { data: player } = useApi<Player | null>(
    async () => {
      try {
        return (await api.getCurrentUserPlayer()) ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  const allConversations = data?.items ?? [];

  const conversations = useMemo(() => {
    if (searchQuery.trim() === '') return allConversations;
    const q = searchQuery.toLowerCase();
    return allConversations.filter((c) =>
      c.full_name.toLowerCase().includes(q),
    );
  }, [allConversations, searchQuery]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onConversationPress = useCallback(
    (playerId: number, name?: string) => {
      void hapticLight();
      router.push(routes.messages(playerId, name));
    },
    [router],
  );

  return {
    conversations,
    isLoading,
    error,
    isRefreshing,
    searchQuery,
    setSearchQuery,
    onRefresh,
    onRetry,
    onConversationPress,
    currentPlayerId: player?.id ?? 0,
  };
}
