/**
 * Compact recent-games list. Sequential history stays vertical so names and
 * scores have room and Home does not become a stack of carousels.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
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
      onPress={() => {
        if (match.session_id != null) {
          router.push(routes.session(match.session_id as number));
        }
      }}
      accessibilityRole="link"
      accessibilityLabel={`${isWin ? 'Win' : 'Loss'} ${match.score ?? ''}`}
      className="bg-surface rounded-card p-md border border-divider"
    >
      <View className="flex-row items-center gap-xs mb-xs">
        <View
          className={`${isWin ? 'bg-success-tint' : 'bg-danger-tint'} px-sm py-[2px] rounded-chip`}
        >
          <Text
            className={`text-[11px] font-semibold ${isWin ? 'text-success' : 'text-danger'}`}
          >
            {isWin ? 'WIN' : 'LOSS'}
          </Text>
        </View>
        {isPending && (
          <View className="bg-warning-tint border border-warning px-[6px] py-[1px] rounded-lg">
            <Text className="text-[10px] font-bold text-warning">
              Pending
            </Text>
          </View>
        )}
      </View>
      {match.score != null && match.score !== '' && (
        <Text className="text-title3 font-bold text-brand-teal mb-0.5">
          {match.score}
        </Text>
      )}
      <Text className="text-caption text-muted leading-[18px]" numberOfLines={2}>
        <Text className="font-semibold text-default">
          You
        </Text>
        {match.partner ? ' / ' : ''}
        <Text
          className={
            match.partner_is_placeholder ? 'italic text-warning' : ''
          }
        >
          {match.partner ?? ''}
        </Text>
      </Text>
      <Text className="text-caption text-muted leading-[18px]" numberOfLines={2}>
        vs{' '}
        <Text
          className={
            match.opponent_1_is_placeholder ? 'italic text-warning' : ''
          }
        >
          {match.opponent_1 ?? ''}
        </Text>
        {match.opponent_2 ? ' / ' : ''}
        <Text
          className={
            match.opponent_2_is_placeholder ? 'italic text-warning' : ''
          }
        >
          {match.opponent_2 ?? ''}
        </Text>
      </Text>
      {meta !== '' && (
        <Text className="text-[11px] text-tertiary mt-xs">
          {meta}
        </Text>
      )}
    </Pressable>
  );
}

export default function RecentGamesScroll({
  matches,
  maxItems = 3,
}: RecentGamesScrollProps): React.ReactNode {
  const visible = matches.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <View className="bg-surface rounded-card p-xl items-center">
        <Text className="text-footnote text-tertiary">
          No games yet
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {visible.map((match, idx) => (
        <GameCard key={(match.id as number | undefined) ?? idx} match={match} />
      ))}
    </View>
  );
}
