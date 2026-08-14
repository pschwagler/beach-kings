/**
 * Data hook for the League Chat tab.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import type { LeagueChatMessage } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';
import { useAuth } from '@/contexts/AuthContext';

export interface UseLeagueChatTabResult {
  readonly messages: readonly LeagueChatMessage[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly messageText: string;
  readonly isSending: boolean;
  readonly sendError: string | null;
  readonly onChangeText: (v: string) => void;
  readonly onSend: () => Promise<void>;
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
export function useLeagueChatTab(
  leagueId: number | string,
  messageText: string,
  setMessageText: (value: string) => void,
): UseLeagueChatTabResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const chatQuery = useQuery({
    queryKey: leagueKeys.chat(userId, leagueId),
    queryFn: async (): Promise<readonly LeagueChatMessage[]> => {
      const rows = (await api.getLeagueMessages(
        Number(leagueId),
      )) as BackendLeagueMessage[];
      return rows.map(withInitials);
    },
    enabled: userId > 0,
  });

  const onChangeText = useCallback((v: string) => {
    setMessageText(v);
  }, [setMessageText]);

  const onSend = useCallback(async (): Promise<void> => {
    const text = messageText.trim();
    if (text.length === 0 || isSending) return;

    setIsSending(true);
    setMessageText('');
    setSendError(null);

    try {
      await api.createLeagueMessage(Number(leagueId), text);
      await queryClient.invalidateQueries({
        queryKey: leagueKeys.chat(userId, leagueId),
      });
    } catch (error) {
      setMessageText(text);
      setSendError(
        getApiErrorMessage(error, 'Failed to send message. Tap the arrow to retry.'),
      );
    } finally {
      setIsSending(false);
    }
  }, [
    isSending,
    leagueId,
    messageText,
    queryClient,
    setMessageText,
    userId,
  ]);

  return {
    messages: chatQuery.data ?? [],
    isLoading: chatQuery.isLoading,
    isError: chatQuery.isError,
    messageText,
    isSending,
    sendError,
    onChangeText,
    onSend,
  };
}
