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
import AppText from '@/components/ui/AppText';
import {
  View,
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
    isRosterEditable,
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
        title={isRosterEditable ? 'Manage Players' : 'View Players'}
        leftAction={
          <TouchableOpacity
            onPress={onClose}
            testID="session-roster-close-btn"
            accessibilityRole="button"
            accessibilityLabel="Close manage players"
            className="min-h-touch min-w-touch items-center justify-center"
          >
            <AppText className="text-[18px] font-semibold text-inverse">✕</AppText>
          </TouchableOpacity>
        }
      />

      {/* Subtitle bar */}
      {sessionSubtitle != null && (
        <View
          testID="roster-subtitle-bar"
          className="px-[16px] py-[12px] bg-surface border-b border-divider"
        >
          <AppText className="text-[13px] font-semibold text-muted">
            {sessionSubtitle}
          </AppText>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center" testID="roster-loading">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: isRosterEditable ? 100 : 24 }}
        >
          {!isRosterEditable && session != null && (
            <View
              testID="roster-locked-message"
              className="mx-[16px] mt-[16px] rounded-[10px] border border-divider bg-elevated px-[14px] py-[12px]"
            >
              <AppText className="text-[13px] font-semibold text-muted">
                Roster locked after submission. Players can no longer be added or removed.
              </AppText>
            </View>
          )}
          {/* In Games section */}
          {playersInGames.length > 0 && (
            <View className="px-[16px]">
              <AppText className="text-[13px] font-bold text-muted uppercase tracking-wider pt-[14px] pb-[8px]">
                In Games (cannot remove)
              </AppText>
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
              <AppText className="text-[13px] font-bold text-muted uppercase tracking-wider pt-[14px] pb-[8px]">
                No Games Yet
              </AppText>
              {playersNoGames.map((player) => (
                <SessionRosterRow
                  key={player.entry_id}
                  player={player}
                  canRemove={isRosterEditable}
                  isRemoving={isRemoving === player.entry_id}
                  onRemove={() => { void onRemovePlayer(player.entry_id); }}
                />
              ))}
            </View>
          )}

          {players.length === 0 && (
            <AppText
              testID="roster-empty"
              className="text-[14px] text-muted text-center py-[32px]"
            >
              No players in this session yet.
            </AppText>
          )}

          {removeError != null && (
            <AppText
              testID="roster-remove-error"
              className="text-[13px] text-red-500 text-center px-[16px] mt-[8px]"
            >
              {removeError}
            </AppText>
          )}
        </ScrollView>
      )}

      {isRosterEditable && (
        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px]">
          <TouchableOpacity
            testID="roster-add-player-btn"
            onPress={onAddPlayer}
            accessibilityRole="button"
            accessibilityLabel="Add player to session"
            className="border-2 border-dashed border-brand-gold rounded-[12px] items-center justify-center py-[14px]"
          >
            <AppText className="text-[15px] font-bold text-accent">+ Add Player</AppText>
          </TouchableOpacity>
        </View>
      )}

      {isRosterEditable && isAddPlayerOpen && (
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
