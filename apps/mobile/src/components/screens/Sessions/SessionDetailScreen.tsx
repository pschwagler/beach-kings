/**
 * SessionDetailScreen — active and submitted session view.
 *
 * Renders:
 *   - Session header (name, meta tags, status)
 *   - Stats bar (Games / Players / Your W-L / Rating change)
 *   - Horizontal roster strip with player chips
 *   - Invite nudge banner for placeholder players
 *   - Games list (SessionGameCard per game)
 *   - Sticky action bar: Add Game + Submit Session (active sessions only)
 *   - ··· menu button in TopNav that opens SessionBottomSheet
 *
 * Wireframe ref: session-active.html, session-detail.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import SessionDetailSkeleton from './SessionDetailSkeleton';
import SessionDetailErrorState from './SessionDetailErrorState';
import SessionPlayerChip from './SessionPlayerChip';
import SessionGameCard from './SessionGameCard';
import SessionBottomSheet from './SessionBottomSheet';
import { useSessionDetailScreen } from './useSessionDetailScreen';
import { parseSessionDate } from '@/lib/formatters';
import type { SessionDetail, SessionGame } from '@beach-kings/shared';

/**
 * Determine which team the calling user is on for a given game by matching
 * their canonical display name against the four team-player names. Returns
 * `null` if no name match is found, which maps to a "PENDING"-styled badge.
 */
function getUserTeamForGame(
  game: SessionGame,
  currentPlayerName: string | null,
): 1 | 2 | null {
  if (!currentPlayerName) return null;
  const norm = currentPlayerName.trim().toLowerCase();
  if (
    game.team1_player1_name.trim().toLowerCase() === norm ||
    game.team1_player2_name.trim().toLowerCase() === norm
  ) {
    return 1;
  }
  if (
    game.team2_player1_name.trim().toLowerCase() === norm ||
    game.team2_player2_name.trim().toLowerCase() === norm
  ) {
    return 2;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

interface StatsBarProps {
  readonly session: SessionDetail;
}

function StatsBar({ session }: StatsBarProps): React.ReactNode {
  const ratingText =
    session.user_rating_change != null
      ? session.user_rating_change > 0
        ? `+${session.user_rating_change.toFixed(1)}`
        : `${session.user_rating_change.toFixed(1)}`
      : '—';

  const stats = [
    { label: 'Games', value: String(session.games.length) },
    { label: 'Players', value: String(session.players.length) },
    { label: 'Your W-L', value: `${session.user_wins}-${session.user_losses}` },
    { label: 'Rating', value: ratingText },
  ];

  return (
    <View
      testID="session-stats-bar"
      className="flex-row bg-page rounded-[12px] mx-[16px] mt-[12px] py-[10px]"
    >
      {stats.map(({ label, value }, i) => (
        <View
          key={label}
          className={`flex-1 items-center ${i < stats.length - 1 ? 'border-r border-divider' : ''}`}
        >
          <Text className="text-[16px] font-bold text-default">
            {value}
          </Text>
          <Text className="text-[11px] text-muted mt-[2px]">
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Invite nudge banner
// ---------------------------------------------------------------------------

function InviteBanner(): React.ReactNode {
  return (
    <View
      testID="session-invite-banner"
      className="mx-[16px] mt-[12px] bg-warning-tint border border-brand-gold/30 rounded-[10px] p-[10px]"
    >
      <Text className="text-[12px] text-warning font-semibold">
        Invite players to claim their spot and earn ELO
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session header
// ---------------------------------------------------------------------------

interface SessionHeaderProps {
  readonly session: SessionDetail;
}

function SessionHeader({ session }: SessionHeaderProps): React.ReactNode {
  const dateLabel = (() => {
    const d = parseSessionDate(session.date);
    if (isNaN(d.getTime())) return session.date;
    return d.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  })();

  return (
    <View className="px-[16px] pt-[16px]">
      <Text className="text-[20px] font-bold text-default">
        {dateLabel} · Session #{session.session_number}
      </Text>
      {session.league_name != null && (
        <Text className="text-[13px] text-brand-teal mt-[2px]">{session.league_name}</Text>
      )}
      <View className="flex-row items-center gap-[8px] mt-[6px] flex-wrap">
        <View className="bg-success-tint px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-bold text-success">
            {session.status === 'active' ? 'Active' : 'Submitted'}
          </Text>
        </View>
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] text-muted">
            {session.session_type === 'pickup' ? 'Pickup' : 'League'}
          </Text>
        </View>
        {session.court_name != null && (
          <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
            <Text className="text-[11px] text-muted">
              {session.court_name}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  readonly sessionId: number;
}

export default function SessionDetailScreen({ sessionId }: Props): React.ReactNode {
  const {
    session,
    isLoading,
    error,
    isRefreshing,
    isMenuOpen,
    isSubmitting,
    submitError,
    currentPlayerName,
    onRefresh,
    onRetry,
    openMenu,
    closeMenu,
    onAddGame,
    onEditGame,
    onSubmitSession,
    onClearSubmitError,
  } = useSessionDetailScreen(sessionId);

  const hasPlaceholders =
    session?.players.some((p) => p.is_placeholder) ?? false;

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="session-detail-screen"
      >
        <TopNav title="Session" showBack />
        <SessionDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (error != null && session == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="session-detail-screen"
      >
        <TopNav title="Session" showBack />
        <SessionDetailErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="session-detail-screen"
    >
      <TopNav
        title="Session"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={openMenu}
            testID="session-menu-btn"
            className="p-[8px]"
          >
            <Text className="text-[20px] text-default">···</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        testID="session-detail-scroll"
      >
        {session != null && (
          <>
            <SessionHeader session={session} />
            <StatsBar session={session} />

            {/* Roster strip */}
            <FlatList
              horizontal
              data={session.players}
              keyExtractor={(p) => String(p.entry_id)}
              renderItem={({ item, index }) => (
                <SessionPlayerChip player={item} isCurrentUser={index === 0} />
              )}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}
              showsHorizontalScrollIndicator={false}
              testID="session-roster-strip"
            />

            {hasPlaceholders && <InviteBanner />}

            {/* Games list */}
            <View className="px-[16px] mt-[16px]">
              <Text className="text-[15px] font-bold text-default mb-[10px]">
                Games
              </Text>
              {session.games.length === 0 ? (
                <Text
                  testID="session-no-games"
                  className="text-[14px] text-muted text-center py-[24px]"
                >
                  No games yet. Tap &quot;Add Game&quot; to record a game.
                </Text>
              ) : (
                session.games.map((game) => (
                  <SessionGameCard
                    key={game.id}
                    game={game}
                    userTeam={getUserTeamForGame(game, currentPlayerName)}
                    onEdit={
                      session.status === 'active'
                        ? () => onEditGame(game)
                        : undefined
                    }
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Submit error banner */}
      {submitError != null && (
        <TouchableOpacity
          testID="session-submit-error"
          onPress={onClearSubmitError}
          className="absolute bottom-[80px] left-0 right-0 mx-[16px] bg-danger-tint rounded-[10px] px-[12px] py-[10px]"
        >
          <Text className="text-[13px] text-danger font-semibold">
            {submitError}
          </Text>
          <Text className="text-[11px] text-danger mt-[2px]">Tap to dismiss</Text>
        </TouchableOpacity>
      )}

      {/* Sticky action bar — active sessions only */}
      {session?.status === 'active' && (
        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[10px] pb-[34px] flex-row gap-[10px]">
          <TouchableOpacity
            testID="session-add-game-btn"
            onPress={onAddGame}
            className="border border-brand-teal rounded-[12px] px-[16px] py-[12px]"
          >
            <Text className="text-[14px] font-semibold text-brand-teal">
              Add Game
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="session-submit-btn"
            onPress={() => { void onSubmitSession(); }}
            disabled={isSubmitting}
            className="flex-1 bg-[#d4a843] rounded-[12px] items-center justify-center py-[12px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" testID="session-submit-loading" />
            ) : (
              <Text className="text-white text-[14px] font-bold">Submit Session</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom sheet menu */}
      {session != null && (
        <SessionBottomSheet
          visible={isMenuOpen}
          onClose={closeMenu}
          sessionId={session.id}
          sessionLabel={`Session #${session.session_number}`}
          gameCount={session.games.length}
          playerCount={session.players.length}
          status={session.status}
        />
      )}
    </SafeAreaView>
  );
}
