/**
 * Data hook for the Messages inbox screen.
 *
 * Fetches the current user's conversation list.
 * Provides search/filter over the loaded conversations client-side.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  messageQueries,
  reconcilePeerIdentityCaches,
  useMessageMutations,
} from "@/features/messages";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { routes } from "@/lib/navigation";
import { hapticLight } from "@/utils/haptics";
import type { Conversation, MessageFolder } from "@beach-kings/shared";

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
  readonly folder: MessageFolder;
  readonly onConversationVisibility: (playerId: number, hidden: boolean) => Promise<void>;
  readonly onHiddenPress: () => void;
  /** The current user's player ID, or 0 if not yet loaded. */
  readonly currentPlayerId: number;
}

export function useMessagesScreen(folder: MessageFolder = 'inbox'): UseMessagesScreenResult {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery(messageQueries.conversations(userId, folder));
  const playerQuery = useCurrentPlayer();
  const { setConversationHidden } = useMessageMutations();

  useEffect(() => {
    if (!conversationsQuery.isFetchedAfterMount) return;
    for (const conversation of conversationsQuery.data?.items ?? []) {
      reconcilePeerIdentityCaches(queryClient, userId, {
        playerId: conversation.player_id,
        fullName: conversation.full_name,
        avatar: conversation.avatar,
      });
    }
  }, [
    conversationsQuery.data,
    conversationsQuery.isFetchedAfterMount,
    queryClient,
    userId,
  ]);

  const conversations = useMemo(() => {
    const allConversations = conversationsQuery.data?.items ?? [];
    if (searchQuery.trim() === "") return allConversations;
    const q = searchQuery.toLowerCase();
    return allConversations.filter((c) =>
      c.full_name.toLowerCase().includes(q),
    );
  }, [conversationsQuery.data, searchQuery]);

  const onRefresh = useCallback(() => {
    void conversationsQuery.refetch();
  }, [conversationsQuery]);

  const onRetry = useCallback(() => {
    void conversationsQuery.refetch();
  }, [conversationsQuery]);

  const onConversationPress = useCallback(
    (playerId: number, name?: string) => {
      void hapticLight();
      router.push(routes.messages(playerId, name));
    },
    [router],
  );

  const onConversationVisibility = useCallback(
    async (playerId: number, hidden: boolean) => {
      void hapticLight();
      await setConversationHidden.mutateAsync({ playerId, hidden });
    },
    [setConversationHidden],
  );

  const onHiddenPress = useCallback(() => {
    void hapticLight();
    router.push(routes.hiddenMessages());
  }, [router]);

  return {
    conversations,
    isLoading: conversationsQuery.isPending,
    error: conversationsQuery.error,
    isRefreshing: conversationsQuery.isRefetching,
    searchQuery,
    setSearchQuery,
    onRefresh,
    onRetry,
    onConversationPress,
    folder,
    onConversationVisibility,
    onHiddenPress,
    currentPlayerId: playerQuery.data?.id ?? 0,
  };
}
