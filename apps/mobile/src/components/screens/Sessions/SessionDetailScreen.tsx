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
import AppText from '@/components/ui/AppText';
import {
  View,
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
import SessionCourtPicker from './SessionCourtPicker';
import { useSessionDetailScreen } from './useSessionDetailScreen';
import { parseSessionDate } from '@/lib/formatters';
import { routes } from '@/lib/navigation';
import { useInvitePlayers } from '@/contexts/InvitePlayersContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
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
    ...(session.status === 'submitted'
      ? [{ label: 'Rating', value: ratingText }]
      : []),
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
          <AppText className="text-[16px] font-bold text-default">
            {value}
          </AppText>
          <AppText className="text-[11px] text-muted mt-[2px]">
            {label}
          </AppText>
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

function InviteBanner({ onPress }: InviteBannerProps): React.ReactNode {
  const palette = usePaletteColors();
  const body = (
    <View className="flex-row items-center">
      <AppText className="flex-1 text-[12px] text-info font-semibold pr-[8px]">
        Invite players to the app to claim their games
      </AppText>
      {onPress != null && (
        <ChevronRightIcon size={16} color={palette.brandTeal} />
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
      accessibilityLabel="Invite players to the Beach League app"
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
      <AppText className="text-[20px] font-bold text-default">
        {dateLabel} · Session #{session.session_number}
      </AppText>
      <View className="flex-row items-center gap-[8px] mt-[6px] flex-wrap">
        <View
          className={`px-[8px] py-[3px] rounded-[10px] ${
            session.status === 'active'
              ? 'bg-status-live-tint'
              : 'bg-success-tint'
          }`}
        >
          <AppText
            className={`text-[11px] font-bold ${
              session.status === 'active' ? 'text-status-live' : 'text-success'
            }`}
          >
            {session.status === 'active' ? 'Active' : 'Submitted'}
          </AppText>
        </View>
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <AppText className="text-[11px] text-muted">
            {session.session_type === 'pickup' ? 'Pickup' : 'League'}
          </AppText>
        </View>
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
        <AppText className={`text-[13px] font-semibold ${showMyGamesOnly ? 'text-on-brand-teal' : 'text-muted'}`}>
          My Games
        </AppText>
        <AppText className={`text-[12px] font-bold ${showMyGamesOnly ? 'text-on-brand-teal' : 'text-muted'}`}>
          {myCount}
        </AppText>
      </TouchableOpacity>
      <TouchableOpacity
        testID="games-filter-all"
        onPress={() => { onToggle(false); }}
        className={`flex-1 flex-row items-center justify-center gap-[6px] py-[7px] rounded-[9px] ${!showMyGamesOnly ? 'bg-brand-teal' : ''}`}
      >
        <AppText className={`text-[13px] font-semibold ${!showMyGamesOnly ? 'text-on-brand-teal' : 'text-muted'}`}>
          All Games
        </AppText>
        <AppText className={`text-[12px] font-bold ${!showMyGamesOnly ? 'text-on-brand-teal' : 'text-muted'}`}>
          {allCount}
        </AppText>
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
  const palette = usePaletteColors();
  const { setPending: setInvitePending } = useInvitePlayers();
  const {
    session,
    isLoading,
    error,
    isRefreshing,
    isMenuOpen,
    isSubmitting,
    submitError,
    isUpdatingCourt,
    courtUpdateError,
    currentPlayerName,
    onRefresh,
    onRetry,
    openMenu,
    closeMenu,
    onAddGame,
    onEditGame,
    onSubmitSession,
    onCourtChange,
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
        title={session?.league_name ?? 'Session'}
        showBack
        rightAction={
          <TouchableOpacity
            onPress={openMenu}
            testID="session-menu-btn"
            accessibilityLabel="Session menu"
            accessibilityRole="button"
            className="min-w-touch min-h-touch items-center justify-center"
          >
            <EllipsisIcon size={22} color={palette.textInverse} />
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
            <View className="mx-[16px] mt-[16px]">
              <AppText className="text-[15px] font-bold text-default">Location</AppText>
              <SessionCourtPicker
                selectedCourtId={session.court_id}
                selectedCourtName={session.court_name}
                onChange={(courtId, courtName) => {
                  void onCourtChange(courtId, courtName);
                }}
                testIDPrefix="session-detail"
                isUpdating={isUpdatingCourt}
                error={courtUpdateError}
              />
            </View>

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
              <AppText className="text-[15px] font-bold text-default">
                Games
              </AppText>
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
                  <AppText
                    testID="session-no-games"
                    className="text-[14px] text-muted text-center py-[24px]"
                  >
                    No games yet. Tap &quot;Add Game&quot; to record a game.
                  </AppText>
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
          <AppText className="text-[13px] text-danger font-semibold">
            {submitError}
          </AppText>
          <AppText className="text-[11px] text-danger mt-[2px]">Tap to dismiss</AppText>
        </TouchableOpacity>
      )}

      {/* Sticky action bar — active sessions only */}
      {session?.status === 'active' && (
        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[10px] pb-[34px] flex-row gap-[10px]">
          <TouchableOpacity
            testID="session-add-game-btn"
            onPress={onAddGame}
            accessibilityRole="button"
            accessibilityLabel="Add game"
            className="min-h-touch border border-brand-teal rounded-[12px] px-[16px] py-[12px]"
          >
            <AppText className="text-[14px] font-semibold text-brand-teal">
              Add Game
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            testID="session-submit-btn"
            onPress={() => { setSubmitConfirmVisible(true); }}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={
              isSubmitting ? 'Submitting session' : 'Submit session'
            }
            accessibilityHint="Locks scores and updates player ratings after confirmation"
            accessibilityState={{
              disabled: isSubmitting,
              busy: isSubmitting,
            }}
            className="min-h-touch flex-1 bg-brand-gold rounded-[12px] items-center justify-center py-[12px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color={palette.onBrandGold} testID="session-submit-loading" />
            ) : (
              <AppText className="text-on-brand-gold text-[14px] font-bold">Submit Session</AppText>
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
          sessionCode={session.code}
          leagueId={session.league_id}
          sessionLabel={`Session #${session.session_number}`}
          gameCount={session.games.length}
          playerCount={session.players.length}
          status={session.status}
        />
      )}
    </SafeAreaView>
  );
}
