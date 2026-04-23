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
    onRemovePlayer,
    onAddPlayer,
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
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="session-roster-screen"
    >
      <TopNav
        title="Manage Players"
        leftAction={
          <TouchableOpacity
            onPress={onClose}
            testID="session-roster-close-btn"
            className="p-[8px]"
          >
            <Text className="text-[16px] text-text-default dark:text-content-primary">✕</Text>
          </TouchableOpacity>
        }
      />

      {/* Subtitle bar */}
      {sessionSubtitle != null && (
        <View
          testID="roster-subtitle-bar"
          className="px-[16px] py-[12px] bg-white dark:bg-[#111] border-b border-[#eee] dark:border-[#2a2a2a]"
        >
          <Text className="text-[13px] font-semibold text-text-secondary dark:text-content-secondary">
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
              <Text className="text-[13px] font-bold text-text-secondary dark:text-content-secondary uppercase tracking-wider pt-[14px] pb-[8px]">
                In Games (cannot remove)
              </Text>
              {playersInGames.map((player) => (
                <SessionRosterRow
                  key={player.id}
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
              <Text className="text-[13px] font-bold text-text-secondary dark:text-content-secondary uppercase tracking-wider pt-[14px] pb-[8px]">
                No Games Yet
              </Text>
              {playersNoGames.map((player) => (
                <SessionRosterRow
                  key={player.id}
                  player={player}
                  canRemove
                  isRemoving={isRemoving === player.id}
                  onRemove={() => { void onRemovePlayer(player.id); }}
                />
              ))}
            </View>
          )}

          {players.length === 0 && (
            <Text
              testID="roster-empty"
              className="text-[14px] text-text-secondary dark:text-content-secondary text-center py-[32px]"
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
      <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-base border-t border-[#eee] dark:border-[#2a2a2a] px-[16px] pt-[12px] pb-[34px]">
        <TouchableOpacity
          testID="roster-add-player-btn"
          onPress={onAddPlayer}
          className="border-2 border-dashed border-[#d4a843] rounded-[12px] items-center justify-center py-[14px]"
        >
          <Text className="text-[15px] font-bold text-[#d4a843]">+ Add Player</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
