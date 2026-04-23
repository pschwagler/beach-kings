/**
 * Data hook for the League Chat tab.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlatList } from 'react-native';
import { mockApi } from '@/lib/mockApi';
import type { LeagueChatMessage } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueChatTabResult {
  readonly messages: readonly LeagueChatMessage[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly messageText: string;
  readonly isSending: boolean;
  readonly onChangeText: (v: string) => void;
  readonly onSend: () => Promise<void>;
  readonly flatListRef: React.RefObject<FlatList<object> | null>;
}

/**
 * Returns all data and handlers needed by LeagueChatTab.
 */
export function useLeagueChatTab(leagueId: number | string): UseLeagueChatTabResult {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList<object> | null>(null);

  const chatQuery = useQuery({
    queryKey: leagueKeys.chat(leagueId),
    queryFn: () => mockApi.getLeagueChat(leagueId), // TODO(backend): GET /api/leagues/:id/messages
  });

  const onChangeText = useCallback((v: string) => {
    setMessageText(v);
  }, []);

  const onSend = useCallback(async (): Promise<void> => {
    const text = messageText.trim();
    if (text.length === 0 || isSending) return;

    setIsSending(true);
    setMessageText('');

    try {
      await mockApi.sendLeagueMessage(leagueId, text); // TODO(backend): POST /api/leagues/:id/messages
      await queryClient.invalidateQueries({ queryKey: leagueKeys.chat(leagueId) });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch {
      // Restore text on failure
      setMessageText(text);
    } finally {
      setIsSending(false);
    }
  }, [leagueId, messageText, isSending, queryClient]);

  return {
    messages: chatQuery.data ?? [],
    isLoading: chatQuery.isLoading,
    isError: chatQuery.isError,
    messageText,
    isSending,
    onChangeText,
    onSend,
    flatListRef,
  };
}
