/**
 * KobStandingsPanel — "Standings" tab content for a KoB tournament.
 *
 * Renders a standings table with columns:
 *   # | Player | W | L | PF | PA | +/-
 *
 * Special rendering:
 *   - Rank 1 gets a trophy icon
 *   - "YOU" row gets a gold left border highlight
 *   - Positive point diff is colored green, negative red
 *   - Tiebreaker note at the bottom
 *
 * Wireframe ref: kob-standings.html
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { KobTournamentDetail, KobStanding } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COL_WIDTHS = {
  rank: 32,
  player: 0, // flex-1
  w: 28,
  l: 28,
  pf: 36,
  pa: 36,
  diff: 44,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TableHeader(): React.ReactNode {
  return (
    <View className="flex-row items-center px-4 py-2 bg-gray-50 dark:bg-base border-b border-border dark:border-border-strong">
      <Text
        style={{ width: COL_WIDTHS.rank }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        #
      </Text>
      <Text className="text-[12px] font-bold text-text-muted dark:text-content-tertiary flex-1">
        Player
      </Text>
      <Text
        style={{ width: COL_WIDTHS.w }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        W
      </Text>
      <Text
        style={{ width: COL_WIDTHS.l }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        L
      </Text>
      <Text
        style={{ width: COL_WIDTHS.pf }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        PF
      </Text>
      <Text
        style={{ width: COL_WIDTHS.pa }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        PA
      </Text>
      <Text
        style={{ width: COL_WIDTHS.diff }}
        className="text-[12px] font-bold text-text-muted dark:text-content-tertiary text-center"
      >
        +/-
      </Text>
    </View>
  );
}

function StandingRow({
  standing,
  isCurrentUser,
}: {
  standing: KobStanding;
  isCurrentUser: boolean;
}): React.ReactNode {
  const isFirst = standing.rank === 1;
  const diffPositive = (standing.point_diff ?? 0) > 0;
  const diffNegative = (standing.point_diff ?? 0) < 0;

  return (
    <View
      testID={`kob-standing-row-${standing.player_id}`}
      className={`flex-row items-center px-4 py-3 border-b border-border dark:border-border-strong ${
        isCurrentUser
          ? 'bg-yellow-50 dark:bg-yellow-900/10'
          : 'bg-white dark:bg-dark-surface'
      }`}
      style={
        isCurrentUser
          ? { borderLeftWidth: 3, borderLeftColor: '#d97706' }
          : undefined
      }
    >
      {/* Rank */}
      <View style={{ width: COL_WIDTHS.rank }} className="items-center">
        {isFirst ? (
          <Text className="text-[16px]">🏆</Text>
        ) : (
          <Text className="text-[13px] font-semibold text-text-muted dark:text-content-secondary">
            {standing.rank}
          </Text>
        )}
      </View>

      {/* Player name */}
      <Text
        className={`flex-1 text-[13px] ${
          isCurrentUser
            ? 'font-bold text-text-default dark:text-content-primary'
            : 'font-medium text-text-default dark:text-content-primary'
        }`}
        numberOfLines={1}
      >
        {isCurrentUser ? 'YOU' : standing.player_name}
      </Text>

      {/* W */}
      <Text
        style={{ width: COL_WIDTHS.w }}
        className="text-[13px] font-semibold text-text-default dark:text-content-primary text-center"
      >
        {standing.wins}
      </Text>

      {/* L */}
      <Text
        style={{ width: COL_WIDTHS.l }}
        className="text-[13px] text-text-muted dark:text-content-secondary text-center"
      >
        {standing.losses}
      </Text>

      {/* PF */}
      <Text
        style={{ width: COL_WIDTHS.pf }}
        className="text-[13px] text-text-default dark:text-content-primary text-center"
      >
        {standing.points_for}
      </Text>

      {/* PA */}
      <Text
        style={{ width: COL_WIDTHS.pa }}
        className="text-[13px] text-text-muted dark:text-content-secondary text-center"
      >
        {standing.points_against}
      </Text>

      {/* +/- */}
      <Text
        style={{ width: COL_WIDTHS.diff }}
        className={`text-[13px] font-semibold text-center ${
          diffPositive
            ? 'text-green-600 dark:text-green-400'
            : diffNegative
              ? 'text-red-500 dark:text-red-400'
              : 'text-text-muted dark:text-content-tertiary'
        }`}
      >
        {(standing.point_diff ?? 0) > 0 ? '+' : ''}
        {standing.point_diff ?? 0}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface KobStandingsPanelProps {
  readonly tournament: KobTournamentDetail;
  /** Player id of the current logged-in user, to highlight the "YOU" row. */
  readonly currentPlayerId?: number | null;
}

export default function KobStandingsPanel({
  tournament,
  currentPlayerId = null,
}: KobStandingsPanelProps): React.ReactNode {
  const standings = [...tournament.standings].sort((a, b) => a.rank - b.rank);

  if (standings.length === 0) {
    return (
      <View
        testID="kob-standings-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary mb-2 text-center">
          Standings Not Available
        </Text>
        <Text className="text-[14px] text-text-muted dark:text-content-secondary text-center">
          Standings will appear here once the tournament begins.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="kob-standings-panel"
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <TableHeader />

      {standings.map((standing) => (
        <StandingRow
          key={standing.player_id}
          standing={standing}
          isCurrentUser={standing.player_id === currentPlayerId}
        />
      ))}

      {/* Tiebreaker note */}
      <View className="px-4 pt-3 pb-2">
        <Text className="text-[11px] text-text-muted dark:text-content-tertiary italic">
          Tiebreakers: Head-to-head record, then point differential (+/-), then
          points for (PF).
        </Text>
      </View>
    </ScrollView>
  );
}
