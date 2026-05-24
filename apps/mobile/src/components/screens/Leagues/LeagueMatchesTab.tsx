/**
 * LeagueMatchesTab — Games tab of the League Detail screen.
 *
 * Shows session cards with game rows, score pairs, W/L badges,
 * and per-session stat footer.
 *
 * Wireframe ref: league-matches.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLeagueMatchesTab, type SessionGroup } from './useLeagueMatchesTab';
import { routes } from '@/lib/navigation';
import { ChevronRightIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { GameHistoryEntry } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSessionDate(isoDate: string): string | null {
  // Backend normalizes to YYYY-MM-DD; parse as local to avoid UTC drift.
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Tappable player name
// ---------------------------------------------------------------------------

interface PlayerNameProps {
  readonly name: string;
  readonly playerId: number | null;
  readonly className?: string;
}

function PlayerName({ name, playerId, className = '' }: PlayerNameProps): React.ReactNode {
  const router = useRouter();
  if (playerId == null) {
    return <Text className={className}>{name}</Text>;
  }
  return (
    <Pressable
      onPress={() => { router.push(routes.player(playerId)); }}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
    >
      <Text className={className}>{name}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Game row
// ---------------------------------------------------------------------------

function GameRow({ game }: { readonly game: GameHistoryEntry }): React.ReactNode {
  const isWin = game.result === 'W';
  const isDraw = game.result === 'D';

  return (
    <View
      testID={`game-row-${game.id}`}
      className="px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-row items-start">
        {/* Teams */}
        <View className="flex-1 min-w-0 mr-2">
          {/* My team: "You" + tappable partners */}
          <View className="flex-row flex-wrap items-center">
            <Text className="text-[13px] font-semibold text-default">You</Text>
            {game.partner_names.map((partnerName, i) => (
              <React.Fragment key={game.partner_ids[i] ?? `partner-${i}`}>
                <Text className="text-[13px] text-muted"> / </Text>
                <PlayerName
                  name={partnerName}
                  playerId={game.partner_ids[i] ?? null}
                  className="text-[13px] font-semibold text-default"
                />
              </React.Fragment>
            ))}
          </View>
          {/* Opponents: tappable names */}
          <View className="flex-row flex-wrap items-center mt-[4px]">
            <Text className="text-[12px] text-muted">vs </Text>
            {game.opponent_names.map((oppName, i) => (
              <React.Fragment key={game.opponent_ids[i] ?? `opp-${i}`}>
                {i > 0 && <Text className="text-[12px] text-muted"> / </Text>}
                <PlayerName
                  name={oppName}
                  playerId={game.opponent_ids[i] ?? null}
                  className="text-[12px] text-muted"
                />
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Score */}
        <Text className="text-[14px] font-bold text-default mr-2">
          {game.my_score} – {game.opponent_score}
        </Text>

        {/* W/L/D badge */}
        <View
          className={`rounded-[6px] px-[8px] py-[3px] ${
            isWin
              ? 'bg-success-tint'
              : isDraw
                ? 'bg-warning-tint'
                : 'bg-danger-tint'
          }`}
        >
          <Text
            className={`text-[11px] font-bold ${
              isWin
                ? 'text-success'
                : isDraw
                  ? 'text-warning'
                  : 'text-danger'
            }`}
          >
            {game.result}
          </Text>
        </View>
      </View>

      {/* Rating change — neutral color when zero */}
      {game.rating_change != null && (
        <Text
          className={`text-[11px] mt-[4px] ${
            game.rating_change > 0
              ? 'text-success'
              : game.rating_change < 0
                ? 'text-danger'
                : 'text-muted'
          }`}
        >
          {game.rating_change > 0 ? '+' : ''}
          {game.rating_change} pts
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function SessionCard({ session }: { readonly session: SessionGroup }): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
  const totalRating = Math.round(session.ratingChange * 10) / 10;
  const dateLabel = session.session_date != null
    ? formatSessionDate(session.session_date)
    : null;

  return (
    <View
      testID={`session-card-${session.session_id}`}
      className="bg-surface rounded-[12px] mx-4 mb-4 border border-divider overflow-hidden"
    >
      {/* Header — tappable to open session detail */}
      <Pressable
        onPress={() => { router.push(routes.session(session.session_id)); }}
        style={({ pressed }) => (pressed ? { opacity: 0.65 } : undefined)}
        className="flex-row items-center px-4 py-[12px] bg-elevated border-b border-divider"
      >
        <View className="flex-1">
          <Text className="text-[13px] font-bold text-default">
            Session #{session.session_number ?? session.session_id}
          </Text>
          {dateLabel != null && (
            <Text className="text-[11px] text-muted mt-[1px]">{dateLabel}</Text>
          )}
        </View>
        <ChevronRightIcon size={18} color={palette.textMuted} />
      </Pressable>

      {/* Game rows */}
      {session.games.map((g) => (
        <GameRow key={g.id} game={g} />
      ))}

      {/* Footer stats */}
      <View className="flex-row px-4 py-[12px] gap-4 border-t border-divider">
        <View>
          <Text className="text-[11px] text-tertiary uppercase tracking-wide">
            Games
          </Text>
          <Text className="text-[14px] font-bold text-default">
            {session.games.length}
          </Text>
        </View>
        <View>
          <Text className="text-[11px] text-tertiary uppercase tracking-wide">
            Your W-L
          </Text>
          <Text className="text-[14px] font-bold text-default">
            {session.userWins}-{session.userLosses}
          </Text>
        </View>
        <View>
          <Text className="text-[11px] text-tertiary uppercase tracking-wide">
            Rating
          </Text>
          <Text
            className={`text-[14px] font-bold ${
              totalRating > 0
                ? 'text-success'
                : totalRating < 0
                  ? 'text-danger'
                  : 'text-muted'
            }`}
          >
            {totalRating > 0 ? '+' : ''}
            {totalRating}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueMatchesTabProps {
  readonly leagueId: number | string;
}

export default function LeagueMatchesTab({ leagueId }: LeagueMatchesTabProps): React.ReactNode {
  const { sessions, isLoading, isError } = useLeagueMatchesTab(leagueId);

  if (isLoading) {
    return (
      <View testID="matches-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="matches-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-default text-center">
          Failed to load games
        </Text>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View
        testID="matches-empty"
        className="flex-1 items-center justify-center px-8 py-16"
      >
        <Text className="text-[18px] font-bold text-default mb-2 text-center">
          No Games Yet
        </Text>
        <Text className="text-[14px] text-muted text-center">
          Games will appear here after sessions are submitted.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="matches-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
    >
      {sessions.map((s) => (
        <SessionCard key={s.session_id} session={s} />
      ))}
    </ScrollView>
  );
}
