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
import AppText from '@/components/ui/AppText';
import { View, ScrollView } from 'react-native';
import type { KobTournamentDetail, KobStanding } from '@beach-kings/shared';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
    <View className="flex-row items-center px-4 py-2 bg-page border-b border-strong">
      <AppText
        style={{ width: COL_WIDTHS.rank }}
        className="text-[12px] font-bold text-muted text-center"
      >
        #
      </AppText>
      <AppText className="text-[12px] font-bold text-muted flex-1">
        Player
      </AppText>
      <AppText
        style={{ width: COL_WIDTHS.w }}
        className="text-[12px] font-bold text-muted text-center"
      >
        W
      </AppText>
      <AppText
        style={{ width: COL_WIDTHS.l }}
        className="text-[12px] font-bold text-muted text-center"
      >
        L
      </AppText>
      <AppText
        style={{ width: COL_WIDTHS.pf }}
        className="text-[12px] font-bold text-muted text-center"
      >
        PF
      </AppText>
      <AppText
        style={{ width: COL_WIDTHS.pa }}
        className="text-[12px] font-bold text-muted text-center"
      >
        PA
      </AppText>
      <AppText
        style={{ width: COL_WIDTHS.diff }}
        className="text-[12px] font-bold text-muted text-center"
      >
        +/-
      </AppText>
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
  const palette = usePaletteColors();
  const isFirst = standing.rank === 1;
  const diffPositive = (standing.point_diff ?? 0) > 0;
  const diffNegative = (standing.point_diff ?? 0) < 0;

  return (
    <View
      testID={`kob-standing-row-${standing.player_id}`}
      className={`flex-row items-center px-4 py-3 border-b border-strong ${
        isCurrentUser
          ? 'bg-warning-tint'
          : 'bg-surface'
      }`}
      style={
        isCurrentUser
          ? { borderLeftWidth: 3, borderLeftColor: palette.warning }
          : undefined
      }
    >
      {/* Rank */}
      <View style={{ width: COL_WIDTHS.rank }} className="items-center">
        {isFirst ? (
          <AppText className="text-[16px]">🏆</AppText>
        ) : (
          <AppText className="text-[13px] font-semibold text-muted">
            {standing.rank}
          </AppText>
        )}
      </View>

      {/* Player name */}
      <AppText
        className={`flex-1 text-[13px] ${
          isCurrentUser
            ? 'font-bold text-default'
            : 'font-medium text-default'
        }`}
        numberOfLines={1}
      >
        {isCurrentUser ? 'YOU' : standing.player_name}
      </AppText>

      {/* W */}
      <AppText
        style={{ width: COL_WIDTHS.w }}
        className="text-[13px] font-semibold text-default text-center"
      >
        {standing.wins}
      </AppText>

      {/* L */}
      <AppText
        style={{ width: COL_WIDTHS.l }}
        className="text-[13px] text-muted text-center"
      >
        {standing.losses}
      </AppText>

      {/* PF */}
      <AppText
        style={{ width: COL_WIDTHS.pf }}
        className="text-[13px] text-default text-center"
      >
        {standing.points_for}
      </AppText>

      {/* PA */}
      <AppText
        style={{ width: COL_WIDTHS.pa }}
        className="text-[13px] text-muted text-center"
      >
        {standing.points_against}
      </AppText>

      {/* +/- */}
      <AppText
        style={{ width: COL_WIDTHS.diff }}
        className={`text-[13px] font-semibold text-center ${
          diffPositive
            ? 'text-success'
            : diffNegative
              ? 'text-danger'
              : 'text-muted'
        }`}
      >
        {(standing.point_diff ?? 0) > 0 ? '+' : ''}
        {standing.point_diff ?? 0}
      </AppText>
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
        <AppText className="text-[16px] font-semibold text-default mb-2 text-center">
          Standings Not Available
        </AppText>
        <AppText className="text-[14px] text-muted text-center">
          Standings will appear here once the tournament begins.
        </AppText>
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
        <AppText className="text-[11px] text-muted italic">
          Tiebreakers: Head-to-head record, then point differential (+/-), then
          points for (PF).
        </AppText>
      </View>
    </ScrollView>
  );
}
