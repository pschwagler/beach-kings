/**
 * Compact recent-games list. Sequential history stays vertical so names and
 * scores have room and Home does not become a stack of carousels.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
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
  const normalizedResult = match.result?.trim().toLowerCase() ?? '';
  const outcome =
    normalizedResult === 'w' || normalizedResult === 'win'
      ? 'win'
      : normalizedResult === 'l' || normalizedResult === 'loss'
        ? 'loss'
        : 'pending';
  const isWin = outcome === 'win';
  const isPending =
    outcome === 'pending' ||
    match.session_status?.toLowerCase() === 'pending' ||
    match.session_status?.toLowerCase() === 'active';
  const sessionId = match.session_id;
  const hasDestination =
    (typeof sessionId === 'number' &&
      Number.isInteger(sessionId) &&
      sessionId > 0) ||
    (typeof sessionId === 'string' && sessionId.trim().length > 0);

  const dateLabel = match.date ? formatDate(match.date, 'short') : '';
  const leagueLabel = match.league_name || match.session_code || '';
  const meta = [dateLabel, leagueLabel].filter(Boolean).join(' · ');

  const outcomeLabel =
    outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Pending game';
  const playersLabel = [match.partner, match.opponent_1, match.opponent_2]
    .filter(
      (name): name is string => typeof name === 'string' && name.length > 0,
    )
    .join(', ');
  const accessibilityLabel = [outcomeLabel, match.score, playersLabel, meta]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View className="flex-row items-center gap-xs mb-xs">
        <View
          className={`${outcome === 'pending' ? 'bg-warning-tint' : isWin ? 'bg-success-tint' : 'bg-danger-tint'} px-sm py-[2px] rounded-chip`}
        >
          <AppText
            className={`text-[11px] font-semibold ${outcome === 'pending' ? 'text-warning' : isWin ? 'text-success' : 'text-danger'}`}
          >
            {outcome === 'pending' ? 'PENDING' : isWin ? 'WIN' : 'LOSS'}
          </AppText>
        </View>
        {isPending && outcome !== 'pending' && (
          <View className="bg-warning-tint border border-warning px-[6px] py-[1px] rounded-lg">
            <AppText className="text-[10px] font-bold text-warning">
              Pending
            </AppText>
          </View>
        )}
      </View>
      {match.score != null && match.score !== '' && (
        <AppText className="text-title3 font-bold text-brand-teal mb-0.5">
          {match.score}
        </AppText>
      )}
      <AppText
        className="text-caption text-muted leading-[18px]"
        numberOfLines={2}
      >
        <AppText className="font-semibold text-default">You</AppText>
        {match.partner ? ' / ' : ''}
        <AppText
          className={match.partner_is_placeholder ? 'italic text-warning' : ''}
        >
          {match.partner ?? ''}
        </AppText>
      </AppText>
      <AppText
        className="text-caption text-muted leading-[18px]"
        numberOfLines={2}
      >
        vs{' '}
        <AppText
          className={
            match.opponent_1_is_placeholder ? 'italic text-warning' : ''
          }
        >
          {match.opponent_1 ?? ''}
        </AppText>
        {match.opponent_2 ? ' / ' : ''}
        <AppText
          className={
            match.opponent_2_is_placeholder ? 'italic text-warning' : ''
          }
        >
          {match.opponent_2 ?? ''}
        </AppText>
      </AppText>
      {meta !== '' && (
        <AppText className="text-[11px] text-tertiary mt-xs">{meta}</AppText>
      )}
    </>
  );

  if (!hasDestination) {
    return (
      <View className="bg-surface rounded-card p-md border border-divider">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(routes.session(sessionId))}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className="bg-surface rounded-card p-md border border-divider"
    >
      {content}
    </Pressable>
  );
}

export default function RecentGamesScroll({
  matches,
  maxItems = 2,
}: RecentGamesScrollProps): React.ReactNode {
  const visible = matches.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <View className="bg-surface rounded-card p-xl items-center">
        <AppText className="text-footnote text-tertiary">No games yet</AppText>
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
