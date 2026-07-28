/**
 * SessionRosterScreen — Manage Players for a session.
 *
 * Sections:
 *   - "In Games (cannot remove)": players with game_count > 0
 *   - "No Games Yet": players with game_count = 0, have Remove button
 *   - Fixed bottom "+ Add Player" button
 *
 * Wireframe ref: session-roster-manage.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import SessionRosterRow from './SessionRosterRow';
import SessionAddPlayerModal from './SessionAddPlayerModal';
import { useSessionRosterScreen } from './useSessionRosterScreen';

interface Props {
  readonly sessionId: number;
}

export default function SessionRosterScreen({ sessionId }: Props): React.ReactNode {
  const {
    session,
    players,
    isLoading,
    isRemoving,
    removeError,
    isAddPlayerOpen,
    onRemovePlayer,
    onAddPlayer,
    onCloseAddPlayer,
    onPlayerAdded,
    onClose,
  } = useSessionRosterScreen(sessionId);

  const playersInGames = players.filter((p) => p.game_count > 0);
  const playersNoGames = players.filter((p) => p.game_count === 0);

  const sessionSubtitle =
    session != null
      ? `${session.court_name ?? 'Session'} · ${players.length} player${players.length !== 1 ? 's' : ''}`
      : undefined;

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="session-roster-screen"
    >
      <TopNav
        title="Manage Players"
        leftAction={
          <TouchableOpacity
            onPress={onClose}
            testID="session-roster-close-btn"
            accessibilityRole="button"
            accessibilityLabel="Close manage players"
            className="min-h-touch min-w-touch items-center justify-center"
          >
            <Text className="text-[18px] font-semibold text-inverse">✕</Text>
          </TouchableOpacity>
        }
      />

      {/* Subtitle bar */}
      {sessionSubtitle != null && (
        <View
          testID="roster-subtitle-bar"
          className="px-[16px] py-[12px] bg-surface border-b border-divider"
        >
          <Text className="text-[13px] font-semibold text-muted">
            {sessionSubtitle}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center" testID="roster-loading">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {/* In Games section */}
          {playersInGames.length > 0 && (
            <View className="px-[16px]">
              <Text className="text-[13px] font-bold text-muted uppercase tracking-wider pt-[14px] pb-[8px]">
                In Games (cannot remove)
              </Text>
              {playersInGames.map((player) => (
                <SessionRosterRow
                  key={player.entry_id}
                  player={player}
                  canRemove={false}
                  isRemoving={false}
                  onRemove={() => {}}
                />
              ))}
            </View>
          )}

          {/* No Games Yet section */}
          {playersNoGames.length > 0 && (
            <View className="px-[16px]">
              <Text className="text-[13px] font-bold text-muted uppercase tracking-wider pt-[14px] pb-[8px]">
                No Games Yet
              </Text>
              {playersNoGames.map((player) => (
                <SessionRosterRow
                  key={player.entry_id}
                  player={player}
                  canRemove
                  isRemoving={isRemoving === player.entry_id}
                  onRemove={() => { void onRemovePlayer(player.entry_id); }}
                />
              ))}
            </View>
          )}

          {players.length === 0 && (
            <Text
              testID="roster-empty"
              className="text-[14px] text-muted text-center py-[32px]"
            >
              No players in this session yet.
            </Text>
          )}

          {removeError != null && (
            <Text
              testID="roster-remove-error"
              className="text-[13px] text-red-500 text-center px-[16px] mt-[8px]"
            >
              {removeError}
            </Text>
          )}
        </ScrollView>
      )}

      {/* Fixed bottom "+ Add Player" */}
      <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px]">
        <TouchableOpacity
          testID="roster-add-player-btn"
          onPress={onAddPlayer}
          accessibilityRole="button"
          accessibilityLabel="Add player to session"
          className="border-2 border-dashed border-brand-gold rounded-[12px] items-center justify-center py-[14px]"
        >
          <Text className="text-[15px] font-bold text-brand-gold">+ Add Player</Text>
        </TouchableOpacity>
      </View>

      {isAddPlayerOpen && (
        <SessionAddPlayerModal
          sessionId={sessionId}
          leagueId={session?.league_id}
          existingPlayerIds={
            new Set(players.map((player) => player.player_id))
          }
          onClose={onCloseAddPlayer}
          onAdded={onPlayerAdded}
        />
      )}
    </SafeAreaView>
  );
}
