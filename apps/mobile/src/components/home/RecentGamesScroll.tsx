/**
 * Horizontal scroller of the user's recent games.
 * Mirrors `home.html` `.game-scroll` + `.game-card`.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { MatchRecord } from '@beach-kings/shared';
import { formatDate } from '@/lib/formatters';
import { routes } from '@/lib/navigation';

interface RecentGamesScrollProps {
  readonly matches: readonly MatchRecord[];
  readonly maxItems?: number;
}

function GameCard({ match }: { readonly match: MatchRecord }): React.ReactNode {
  const router = useRouter();
  const isWin = match.result === 'W' || match.result === 'win';
  const isPending =
    match.session_status === 'pending' || match.session_status === 'active';

  const dateLabel = match.date ? formatDate(match.date, 'short') : '';
  const leagueLabel = match.league_name || match.session_code || '';
  const meta = [dateLabel, leagueLabel].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => router.push(routes.myStats())}
      accessibilityRole="link"
      accessibilityLabel={`${isWin ? 'Win' : 'Loss'} ${match.score ?? ''}`}
      className="min-w-[200px] bg-white dark:bg-dark-surface rounded-card p-md shadow-sm dark:shadow-none dark:border dark:border-border-subtle"
    >
      <View className="flex-row items-center gap-xs mb-xs">
        <View
          className={`${isWin ? 'bg-success-tint dark:bg-success-bg' : 'bg-danger-tint dark:bg-danger-bg'} px-sm py-[2px] rounded-chip`}
        >
          <Text
            className={`text-[11px] font-semibold ${isWin ? 'text-success dark:text-success-text' : 'text-danger dark:text-danger-text'}`}
          >
            {isWin ? 'WIN' : 'LOSS'}
          </Text>
        </View>
        {isPending && (
          <View className="bg-warning-tint dark:bg-warning-bg border border-warning px-[6px] py-[1px] rounded-lg">
            <Text className="text-[10px] font-bold text-[#b45309] dark:text-warning-text">
              Pending
            </Text>
          </View>
        )}
      </View>
      {match.score != null && match.score !== '' && (
        <Text className="text-title3 font-bold text-primary dark:text-content-primary mb-0.5">
          {match.score}
        </Text>
      )}
      <Text className="text-caption text-gray-700 dark:text-content-secondary leading-[18px]">
        <Text className="font-semibold text-text-default dark:text-content-primary">
          You
        </Text>
        {match.partner ? ' / ' : ''}
        <Text
          className={
            match.partner_is_placeholder
              ? 'italic text-[#b45309] dark:text-warning-text'
              : ''
          }
        >
          {match.partner ?? ''}
        </Text>
      </Text>
      <Text className="text-caption text-gray-700 dark:text-content-secondary leading-[18px]">
        vs{' '}
        <Text
          className={
            match.opponent_1_is_placeholder
              ? 'italic text-[#b45309] dark:text-warning-text'
              : ''
          }
        >
          {match.opponent_1 ?? ''}
        </Text>
        {match.opponent_2 ? ' / ' : ''}
        <Text
          className={
            match.opponent_2_is_placeholder
              ? 'italic text-[#b45309] dark:text-warning-text'
              : ''
          }
        >
          {match.opponent_2 ?? ''}
        </Text>
      </Text>
      {meta !== '' && (
        <Text className="text-[11px] text-gray-600 dark:text-content-tertiary mt-xs">
          {meta}
        </Text>
      )}
    </Pressable>
  );
}

export default function RecentGamesScroll({
  matches,
  maxItems = 10,
}: RecentGamesScrollProps): React.ReactNode {
  const visible = matches.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <View className="bg-white dark:bg-dark-surface rounded-card p-xl items-center">
        <Text className="text-footnote text-gray-500 dark:text-content-tertiary">
          No games yet
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
    >
      {visible.map((match, idx) => (
        <GameCard key={(match.id as number | undefined) ?? idx} match={match} />
      ))}
    </ScrollView>
  );
}
