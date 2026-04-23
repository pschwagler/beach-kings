/**
 * KobSchedulePanel — "Schedule" tab content for a KoB tournament.
 *
 * Renders collapsible round cards, each showing:
 *   - Round header with status badge (Complete/In Progress/Upcoming)
 *   - Match rows: court label, team names, score or "vs"
 *   - Winner bolded when a match is complete
 *   - "Pairings TBD" for upcoming rounds with no matches
 *
 * Wireframe ref: kob-schedule.html
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import type { KobTournamentDetail, KobMatch } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: 'complete' | 'in_progress' | 'upcoming';
}): React.ReactNode {
  const config = {
    complete: {
      label: 'Complete',
      className: 'bg-green-100 dark:bg-green-900/30',
      textClassName: 'text-green-700 dark:text-green-400',
    },
    in_progress: {
      label: 'In Progress',
      className: 'bg-teal-50 dark:bg-info-bg',
      textClassName: 'text-primary dark:text-brand-teal',
    },
    upcoming: {
      label: 'Upcoming',
      className: 'bg-gray-100 dark:bg-dark-surface',
      textClassName: 'text-text-muted dark:text-content-tertiary',
    },
  }[status];

  return (
    <View className={`px-2 py-0.5 rounded-full ${config.className}`}>
      <Text className={`text-[11px] font-semibold ${config.textClassName}`}>
        {config.label}
      </Text>
    </View>
  );
}

function MatchRow({ match }: { match: KobMatch }): React.ReactNode {
  const isCompleted = match.team1_score != null && match.team2_score != null;
  const team1Won = isCompleted && match.winner === 1;
  const team2Won = isCompleted && match.winner === 2;

  return (
    <View
      testID={`kob-schedule-match-${match.id}`}
      className="flex-row items-center py-2 px-4 border-b border-border dark:border-border-strong last:border-0"
    >
      {/* Court */}
      <Text className="text-[12px] text-text-muted dark:text-content-tertiary w-14">
        Ct {match.court_num}
      </Text>

      {/* Teams + score */}
      <View className="flex-1 flex-row items-center justify-between">
        <Text
          className={`text-[13px] flex-1 ${
            team1Won
              ? 'font-bold text-text-default dark:text-content-primary'
              : 'text-text-default dark:text-content-primary'
          }`}
          numberOfLines={1}
        >
          {match.team1_player1_name} / {match.team1_player2_name}
        </Text>

        <Text className="text-[13px] font-bold text-text-muted dark:text-content-secondary mx-2 min-w-[40px] text-center">
          {isCompleted
            ? `${match.team1_score}-${match.team2_score}`
            : 'vs'}
        </Text>

        <Text
          className={`text-[13px] flex-1 text-right ${
            team2Won
              ? 'font-bold text-text-default dark:text-content-primary'
              : 'text-text-default dark:text-content-primary'
          }`}
          numberOfLines={1}
        >
          {match.team2_player1_name} / {match.team2_player2_name}
        </Text>
      </View>
    </View>
  );
}

interface RoundCardProps {
  readonly roundNum: number;
  readonly status: 'complete' | 'in_progress' | 'upcoming';
  readonly matches: readonly KobMatch[];
  readonly isPlayoff?: boolean;
}

function RoundCard({
  roundNum,
  status,
  matches,
  isPlayoff = false,
}: RoundCardProps): React.ReactNode {
  const [expanded, setExpanded] = useState(
    status === 'in_progress' || status === 'upcoming',
  );

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const title = isPlayoff ? 'Playoffs' : `Round ${roundNum}`;

  return (
    <View
      testID={`kob-round-card-${roundNum}`}
      className="mx-4 mb-3 bg-white dark:bg-dark-surface rounded-xl shadow-sm dark:shadow-none dark:border dark:border-border-subtle overflow-hidden"
    >
      {/* Header */}
      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`${title} — ${status.replace('_', ' ')}`}
        className="flex-row items-center justify-between px-4 py-3 active:bg-gray-50 dark:active:bg-base"
      >
        <Text className="text-[15px] font-semibold text-text-default dark:text-content-primary">
          {title}
        </Text>
        <View className="flex-row items-center gap-2">
          <StatusBadge status={status} />
          <Text className="text-[16px] text-text-muted dark:text-content-tertiary">
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>

      {/* Matches */}
      {expanded && (
        <View className="border-t border-border dark:border-border-strong">
          {matches.length === 0 || status === 'upcoming' ? (
            <Text className="px-4 py-3 text-[13px] text-text-muted dark:text-content-tertiary italic">
              Pairings TBD
            </Text>
          ) : (
            matches.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface KobSchedulePanelProps {
  readonly tournament: KobTournamentDetail;
}

export default function KobSchedulePanel({
  tournament,
}: KobSchedulePanelProps): React.ReactNode {
  // Group matches by round
  const roundMap = new Map<
    number,
    { status: 'complete' | 'in_progress' | 'upcoming'; matches: KobMatch[] }
  >();

  const currentRound = tournament.current_round ?? 1;
  const maxRounds = tournament.max_rounds ?? 8;

  for (let r = 1; r <= maxRounds; r++) {
    const roundMatches = tournament.matches.filter((m) => m.round_num === r);
    let status: 'complete' | 'in_progress' | 'upcoming';

    if (r < currentRound) {
      status = 'complete';
    } else if (r === currentRound) {
      status = 'in_progress';
    } else {
      status = 'upcoming';
    }

    roundMap.set(r, { status, matches: roundMatches });
  }

  const rounds = Array.from(roundMap.entries());

  if (rounds.length === 0) {
    return (
      <View
        testID="kob-schedule-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary mb-2 text-center">
          Schedule Not Available
        </Text>
        <Text className="text-[14px] text-text-muted dark:text-content-secondary text-center">
          The tournament schedule will appear here once it begins.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="kob-schedule-panel"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}
    >
      {rounds.map(([roundNum, { status, matches }]) => (
        <RoundCard
          key={roundNum}
          roundNum={roundNum}
          status={status}
          matches={matches}
        />
      ))}
    </ScrollView>
  );
}
