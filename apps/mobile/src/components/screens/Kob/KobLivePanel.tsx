/**
 * KobLivePanel — "Now Playing" tab content for an active KoB tournament.
 *
 * Shows:
 *   - "In Progress" section: score cards for current-round matches with null scores
 *   - "Completed This Round" section: score cards for matches with scores recorded
 *
 * Director controls (Advance Round, End Tournament) are rendered as
 * view-only / disabled since creation belongs to a separate director domain.
 *
 * Wireframe ref: kob-live.html
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, ScrollView } from 'react-native';
import { formatGameScore } from '@/lib/formatters';
import type { KobTournamentDetail, KobMatch } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }): React.ReactNode {
  return (
    <AppText className="text-[13px] font-semibold text-muted uppercase tracking-wide px-4 py-2 mt-2">
      {text}
    </AppText>
  );
}

function MatchCard({ match }: { match: KobMatch }): React.ReactNode {
  const completedScore =
    match.team1_score != null && match.team2_score != null
      ? formatGameScore(match.team1_score, match.team2_score)
      : null;
  const isCompleted = completedScore != null;
  const team1Name = `${match.team1_player1_name} / ${match.team1_player2_name}`;
  const team2Name = `${match.team2_player1_name} / ${match.team2_player2_name}`;

  return (
    <View
      testID={`kob-match-card-${match.id}`}
      className="bg-surface rounded-xl p-4 border border-divider mb-3 mx-4"
    >
      {/* Court label */}
      <AppText className="text-[12px] font-medium text-muted uppercase tracking-wide mb-2">
        Court {match.court_num}
      </AppText>

      {/* Teams vs row */}
      <View className="flex-row items-center justify-between mb-3">
        <AppText
          className={`text-[14px] font-semibold flex-1 ${
            isCompleted && match.winner === 1
              ? 'text-brand-teal'
              : 'text-default'
          }`}
          numberOfLines={2}
        >
          {team1Name}
        </AppText>
        <AppText className="text-[13px] font-bold text-muted mx-2">
          {completedScore ?? 'vs'}
        </AppText>
        <AppText
          className={`text-[14px] font-semibold flex-1 text-right ${
            isCompleted && match.winner === 2
              ? 'text-brand-teal'
              : 'text-default'
          }`}
          numberOfLines={2}
        >
          {team2Name}
        </AppText>
      </View>

      {/* Director controls — view-only */}
      {!isCompleted && (
        <View
          testID={`kob-submit-score-${match.id}`}
          className="py-2 px-4 rounded-lg bg-page items-center"
          accessibilityLabel="Submit Score (director only)"
        >
          <AppText className="text-[13px] text-muted">
            Score Entry (Director Only)
          </AppText>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface KobLivePanelProps {
  readonly tournament: KobTournamentDetail;
}

export default function KobLivePanel({
  tournament,
}: KobLivePanelProps): React.ReactNode {
  const currentRound = tournament.current_round ?? 1;
  const roundMatches = tournament.matches.filter(
    (m) => m.round_num === currentRound,
  );

  const inProgress = roundMatches.filter(
    (m) => m.team1_score == null || m.team2_score == null,
  );
  const completed = roundMatches.filter(
    (m) => m.team1_score != null && m.team2_score != null,
  );

  if (roundMatches.length === 0) {
    return (
      <View
        testID="kob-live-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <AppText className="text-[16px] font-semibold text-default mb-2 text-center">
          No Matches in Progress
        </AppText>
        <AppText className="text-[14px] text-muted text-center">
          Waiting for the tournament director to start Round {currentRound}.
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      testID="kob-live-panel"
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      {inProgress.length > 0 && (
        <>
          <SectionLabel text="In Progress" />
          {inProgress.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </>
      )}

      {completed.length > 0 && (
        <>
          <SectionLabel text="Completed This Round" />
          {completed.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </>
      )}

      {/* Director panel — view-only footer */}
      <View
        testID="kob-director-panel"
        className="mx-4 mt-4 p-4 rounded-xl border border-strong bg-surface items-center gap-3"
      >
        <AppText className="text-[13px] text-muted font-medium">
          Director Controls
        </AppText>
        <View className="flex-row gap-3 w-full">
          <View className="flex-1 py-3 rounded-lg bg-page items-center">
            <AppText className="text-[13px] text-muted">
              Advance Round
            </AppText>
          </View>
          <View className="flex-1 py-3 rounded-lg border border-danger-tint items-center">
            <AppText className="text-[13px] text-danger">
              End Tournament
            </AppText>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
