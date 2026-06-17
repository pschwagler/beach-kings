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

import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { EllipsisIcon, ChevronRightIcon } from '@/components/ui/icons';
import SessionDetailSkeleton from './SessionDetailSkeleton';
import SessionDetailErrorState from './SessionDetailErrorState';
import SessionPlayerChip from './SessionPlayerChip';
import SessionGameCard from './SessionGameCard';
import SessionBottomSheet from './SessionBottomSheet';
import { useSessionDetailScreen } from './useSessionDetailScreen';
import { parseSessionDate } from '@/lib/formatters';
import { routes } from '@/lib/navigation';
import { useInvitePlayers } from '@/contexts/InvitePlayersContext';
import type { SessionDetail, SessionGame, SessionPlayer } from '@beach-kings/shared';

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

/**
 * Build the "Sunday Pickup · Apr 6" context strip label for the invite screen.
 * Pure helper so banner navigation stays declarative.
 */
function buildInviteContextLabel(session: SessionDetail): string {
  const typeLabel = session.session_type === 'pickup' ? 'Pickup' : 'League';
  const d = parseSessionDate(session.date);
  const dateLabel = isNaN(d.getTime())
    ? session.date
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const leaguePrefix = session.league_name ?? typeLabel;
  return `${leaguePrefix} · ${dateLabel}`;
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

interface InviteBannerProps {
  readonly onPress?: () => void;
}

// Light-mode brand-teal hex; chevron lives on info-tint background and reads
// well in both themes. Inlined to keep this leaf component theme-context-free.
const INVITE_CHEVRON_COLOR = '#0D9488';

function InviteBanner({ onPress }: InviteBannerProps): React.ReactNode {
  const body = (
    <View className="flex-row items-center">
      <Text className="flex-1 text-[12px] text-info font-semibold pr-[8px]">
        Invite players to claim their Beach League profile
      </Text>
      {onPress != null && (
        <ChevronRightIcon size={16} color={INVITE_CHEVRON_COLOR} />
      )}
    </View>
  );

  if (onPress == null) {
    return (
      <View
        testID="session-invite-banner"
        className="mx-[16px] mt-[12px] bg-info-tint rounded-[10px] p-[10px]"
      >
        {body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      testID="session-invite-banner"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Invite players"
      className="mx-[16px] mt-[12px] bg-info-tint rounded-[10px] p-[10px]"
    >
      {body}
    </TouchableOpacity>
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
      <View className="flex-row items-center gap-[8px] mt-[6px] flex-wrap">
        <View
          className={`px-[8px] py-[3px] rounded-[10px] ${
            session.status === 'active'
              ? 'bg-status-live-tint'
              : 'bg-success-tint'
          }`}
        >
          <Text
            className={`text-[11px] font-bold ${
              session.status === 'active' ? 'text-status-live' : 'text-success'
            }`}
          >
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
// Games filter toggle
// ---------------------------------------------------------------------------

interface GamesFilterToggleProps {
  readonly myCount: number;
  readonly allCount: number;
  readonly showMyGamesOnly: boolean;
  readonly onToggle: (showMine: boolean) => void;
}

function GamesFilterToggle({
  myCount,
  allCount,
  showMyGamesOnly,
  onToggle,
}: GamesFilterToggleProps): React.ReactNode {
  return (
    <View
      testID="games-filter-toggle"
      className="flex-row bg-elevated border border-divider rounded-[12px] mt-[8px] p-[3px]"
    >
      <TouchableOpacity
        testID="games-filter-my"
        onPress={() => { onToggle(true); }}
        className={`flex-1 flex-row items-center justify-center gap-[6px] py-[7px] rounded-[9px] ${showMyGamesOnly ? 'bg-brand-teal' : ''}`}
      >
        <Text className={`text-[13px] font-semibold ${showMyGamesOnly ? 'text-white' : 'text-muted'}`}>
          My Games
        </Text>
        <Text className={`text-[12px] font-bold ${showMyGamesOnly ? 'text-white/80' : 'text-muted'}`}>
          {myCount}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="games-filter-all"
        onPress={() => { onToggle(false); }}
        className={`flex-1 flex-row items-center justify-center gap-[6px] py-[7px] rounded-[9px] ${!showMyGamesOnly ? 'bg-brand-teal' : ''}`}
      >
        <Text className={`text-[13px] font-semibold ${!showMyGamesOnly ? 'text-white' : 'text-muted'}`}>
          All Games
        </Text>
        <Text className={`text-[12px] font-bold ${!showMyGamesOnly ? 'text-white/80' : 'text-muted'}`}>
          {allCount}
        </Text>
      </TouchableOpacity>
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
  const router = useRouter();
  const { setPending: setInvitePending } = useInvitePlayers();
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

  const [showMyGamesOverride, setShowMyGamesOverride] = useState<boolean | null>(null);
  const [submitConfirmVisible, setSubmitConfirmVisible] = useState(false);

  const hasPlaceholders =
    session?.players.some((p) => p.is_placeholder) ?? false;

  const myGames = (session?.games ?? []).filter(
    (g) => getUserTeamForGame(g, currentPlayerName) !== null,
  );
  const showToggle = currentPlayerName != null && myGames.length > 0;
  const showMyGamesOnly =
    showMyGamesOverride ?? (session?.status !== 'active' && myGames.length > 0);
  const displayedGames = showMyGamesOnly && showToggle ? myGames : (session?.games ?? []);

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="session-detail-screen"
      >
        <TopNav title="Session" showBack backFallback={routes.home()} />
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
        <TopNav title="Session" showBack backFallback={routes.home()} />
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
        title={session?.league_name ?? 'Session'}
        showBack
        backFallback={routes.home()}
        rightAction={
          <TouchableOpacity
            onPress={openMenu}
            testID="session-menu-btn"
            accessibilityLabel="Session menu"
            accessibilityRole="button"
            className="min-w-touch min-h-touch items-center justify-center"
          >
            <EllipsisIcon size={22} color="#ffffff" />
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
                <SessionPlayerChip
                  player={item}
                  isCurrentUser={index === 0}
                  onPress={
                    item.player_id != null && !item.is_placeholder
                      ? () => { router.push(routes.player(item.player_id!)); }
                      : undefined
                  }
                />
              )}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}
              showsHorizontalScrollIndicator={false}
              testID="session-roster-strip"
            />

            {hasPlaceholders && (
              <InviteBanner
                onPress={() => {
                  const placeholders = session.players.filter(
                    (p: SessionPlayer) => p.is_placeholder && p.invite_url != null,
                  );
                  const contextLabel = buildInviteContextLabel(session);
                  setInvitePending({
                    contextLabel,
                    contextSubLabel:
                      placeholders.length === 1
                        ? '1 unclaimed player'
                        : `${placeholders.length} unclaimed players`,
                    players: placeholders.map((p: SessionPlayer) => ({
                      id: String(p.entry_id),
                      name: p.display_name,
                      initials: p.initials,
                      metaLabel:
                        p.game_count === 1 ? '1 game' : `${p.game_count} games`,
                      inviteUrl: p.invite_url ?? '',
                    })),
                  });
                  router.push(routes.invitePlayers());
                }}
              />
            )}

            {/* Games list */}
            <View className="px-[16px] mt-[16px]">
              <Text className="text-[15px] font-bold text-default">
                Games
              </Text>
              {showToggle && (
                <GamesFilterToggle
                  myCount={myGames.length}
                  allCount={session.games.length}
                  showMyGamesOnly={showMyGamesOnly}
                  onToggle={setShowMyGamesOverride}
                />
              )}
              <View className="mt-[10px]">
                {session.games.length === 0 ? (
                  <Text
                    testID="session-no-games"
                    className="text-[14px] text-muted text-center py-[24px]"
                  >
                    No games yet. Tap &quot;Add Game&quot; to record a game.
                  </Text>
                ) : (
                  displayedGames.map((game) => (
                    <SessionGameCard
                      key={game.id}
                      game={game}
                      userTeam={getUserTeamForGame(game, currentPlayerName)}
                      currentPlayerName={currentPlayerName}
                      onEdit={
                        session.status === 'active'
                          ? () => onEditGame(game)
                          : undefined
                      }
                    />
                  ))
                )}
              </View>
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
            onPress={() => { setSubmitConfirmVisible(true); }}
            disabled={isSubmitting}
            className="flex-1 bg-brand-gold rounded-[12px] items-center justify-center py-[12px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" testID="session-submit-loading" />
            ) : (
              <Text className="text-white text-[14px] font-bold">Submit Session</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Submit confirmation — locks scores + rating updates are irreversible. */}
      <ConfirmDialog
        testID="session-submit-confirm"
        visible={submitConfirmVisible}
        title="Submit session?"
        message="Scores will be locked and ratings updated. This can't be undone."
        confirmLabel="Submit"
        confirmVariant="destructive"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setSubmitConfirmVisible(false);
          void onSubmitSession();
        }}
        onCancel={() => { setSubmitConfirmVisible(false); }}
      />

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
