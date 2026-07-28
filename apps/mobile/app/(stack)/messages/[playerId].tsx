/**
 * Message thread route — thin entry point.
 * Reads the [playerId] dynamic param, optional `name` query param, and fetches
 * the current player before rendering MessageThreadScreen.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { messageQueries } from '@/features/messages';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import { MessageThreadScreen } from '@/components/screens/Messages';

interface PlayerLite {
  readonly id: number;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly full_name?: string | null;
  readonly name?: string | null;
}

function extractPlayerName(player: PlayerLite | undefined): string {
  if (player == null) return '';
  if (player.full_name != null && player.full_name.trim().length > 0) {
    return player.full_name;
  }
  const first = player.first_name ?? '';
  const last = player.last_name ?? '';
  const combined = `${first} ${last}`.trim();
  if (combined.length > 0) return combined;
  return player.name ?? '';
}

export default function MessageThreadRoute(): React.ReactNode {
  const { playerId, name } = useLocalSearchParams<{
    playerId: string;
    name?: string;
  }>();
  const id = Number(playerId ?? '0');
  const passedName = typeof name === 'string' ? name : '';
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const peerQuery = useQuery(
    messageQueries.peer(userId, id, passedName.trim().length === 0),
  );
  const currentPlayerQuery = useCurrentPlayer();
  const otherPlayer = peerQuery.data as PlayerLite | undefined;
  const resolvedName =
    passedName.trim().length > 0
      ? passedName
      : extractPlayerName(otherPlayer);

  return (
    <MessageThreadScreen
      playerId={id}
      playerName={resolvedName}
      currentPlayerId={currentPlayerQuery.data?.id ?? 0}
    />
  );
}
