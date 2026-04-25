/**
 * Data hook for the League Chat tab.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlatList } from 'react-native';
import { api } from '@/lib/api';
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

/** Shape returned by the backend — identical to LeagueChatMessage minus initials. */
type BackendLeagueMessage = Omit<LeagueChatMessage, 'initials'>;

function computeInitials(name: string | null): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    return (parts[0]!.slice(0, 2) || '??').toUpperCase();
  }
  const first = parts[0]![0] ?? '';
  const last = parts[parts.length - 1]![0] ?? '';
  return `${first}${last}`.toUpperCase();
}

function withInitials(row: BackendLeagueMessage): LeagueChatMessage {
  return { ...row, initials: computeInitials(row.player_name) };
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
    queryFn: async (): Promise<readonly LeagueChatMessage[]> => {
      const rows = (await api.getLeagueMessages(
        Number(leagueId),
      )) as BackendLeagueMessage[];
      return rows.map(withInitials);
    },
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
      await api.createLeagueMessage(Number(leagueId), text);
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
