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
import { View, Text, ScrollView } from 'react-native';
import type { KobTournamentDetail, KobMatch } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }): React.ReactNode {
  return (
    <Text className="text-[13px] font-semibold text-text-muted dark:text-content-secondary uppercase tracking-wide px-4 py-2 mt-2">
      {text}
    </Text>
  );
}

function MatchCard({ match }: { match: KobMatch }): React.ReactNode {
  const isCompleted = match.team1_score != null && match.team2_score != null;
  const team1Name = `${match.team1_player1_name} / ${match.team1_player2_name}`;
  const team2Name = `${match.team2_player1_name} / ${match.team2_player2_name}`;

  return (
    <View
      testID={`kob-match-card-${match.id}`}
      className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-3 mx-4"
    >
      {/* Court label */}
      <Text className="text-[12px] font-medium text-text-muted dark:text-content-tertiary uppercase tracking-wide mb-2">
        Court {match.court_num}
      </Text>

      {/* Teams vs row */}
      <View className="flex-row items-center justify-between mb-3">
        <Text
          className={`text-[14px] font-semibold flex-1 ${
            isCompleted && match.winner === 1
              ? 'text-primary dark:text-brand-teal'
              : 'text-text-default dark:text-content-primary'
          }`}
          numberOfLines={2}
        >
          {team1Name}
        </Text>
        <Text className="text-[13px] font-bold text-text-muted dark:text-content-secondary mx-2">
          {isCompleted
            ? `${match.team1_score} - ${match.team2_score}`
            : 'vs'}
        </Text>
        <Text
          className={`text-[14px] font-semibold flex-1 text-right ${
            isCompleted && match.winner === 2
              ? 'text-primary dark:text-brand-teal'
              : 'text-text-default dark:text-content-primary'
          }`}
          numberOfLines={2}
        >
          {team2Name}
        </Text>
      </View>

      {/* Director controls — view-only */}
      {!isCompleted && (
        <View
          testID={`kob-submit-score-${match.id}`}
          className="py-2 px-4 rounded-lg bg-gray-100 dark:bg-base items-center"
          accessibilityLabel="Submit Score (director only)"
        >
          <Text className="text-[13px] text-text-muted dark:text-content-tertiary">
            Score Entry (Director Only)
          </Text>
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
        <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary mb-2 text-center">
          No Matches in Progress
        </Text>
        <Text className="text-[14px] text-text-muted dark:text-content-secondary text-center">
          Waiting for the tournament director to start Round {currentRound}.
        </Text>
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
        className="mx-4 mt-4 p-4 rounded-xl border border-border dark:border-border-strong bg-gray-50 dark:bg-dark-surface items-center gap-3"
      >
        <Text className="text-[13px] text-text-muted dark:text-content-tertiary font-medium">
          Director Controls
        </Text>
        <View className="flex-row gap-3 w-full">
          <View className="flex-1 py-3 rounded-lg bg-gray-200 dark:bg-base items-center">
            <Text className="text-[13px] text-text-muted dark:text-content-tertiary">
              Advance Round
            </Text>
          </View>
          <View className="flex-1 py-3 rounded-lg border border-red-200 dark:border-red-900 items-center">
            <Text className="text-[13px] text-red-400 dark:text-red-500">
              End Tournament
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
