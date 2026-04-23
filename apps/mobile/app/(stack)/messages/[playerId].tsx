/**
 * Message thread route — thin entry point.
 * Reads the [playerId] dynamic param, optional `name` query param, and fetches
 * the current player before rendering MessageThreadScreen.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
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

  const { data: otherPlayer } = useApi<PlayerLite>(
    () => api.getPlayerStats(id) as Promise<PlayerLite>,
    [id],
    { enabled: id > 0 },
  );

  const { data: currentPlayer } = useApi<PlayerLite>(
    () => api.getCurrentUserPlayer() as Promise<PlayerLite>,
    [],
  );

  const passedName = typeof name === 'string' ? name : '';
  const resolvedName =
    passedName.trim().length > 0
      ? passedName
      : extractPlayerName(otherPlayer);

  return (
    <MessageThreadScreen
      playerId={id}
      playerName={resolvedName}
      currentPlayerId={currentPlayer?.id ?? 0}
    />
  );
}
