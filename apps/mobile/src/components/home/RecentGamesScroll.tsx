import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { MatchRecord } from '@beach-kings/shared';
import { formatDate } from '@/lib/formatters';
import { parseCalendarDate } from '@/lib/calendarDate';
import { routes } from '@/lib/navigation';
import HomePreviewRow from './HomePreviewRow';

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
  const sessionIsOpen =
    match.session_status?.toLowerCase() === 'pending' ||
    match.session_status?.toLowerCase() === 'active';
  const ratingWaitsForAccount =
    match.partner_is_placeholder === true ||
    match.opponent_1_is_placeholder === true ||
    match.opponent_2_is_placeholder === true;
  const sessionId = match.session_id;
  const hasDestination =
    (typeof sessionId === 'number' &&
      Number.isInteger(sessionId) &&
      sessionId > 0) ||
    (typeof sessionId === 'string' && sessionId.trim().length > 0);

  const dateLabel = match.date
    ? formatDate(parseCalendarDate(match.date) ?? match.date, 'short')
    : '';
  const leagueLabel = match.league_name || match.session_code || '';
  const meta = [dateLabel, leagueLabel].filter(Boolean).join(' · ');
  const showSessionStatusInMeta = sessionIsOpen && outcome !== 'pending';

  const outcomeLabel =
    outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Pending game';
  const partnerLabel = match.partner ? `You and ${match.partner}` : null;
  const opponents = [match.opponent_1, match.opponent_2].filter(Boolean).join(' and ');
  const opponentsLabel = opponents ? `versus ${opponents}` : null;
  const statusLabel = sessionIsOpen
    ? 'Session awaiting submission'
    : ratingWaitsForAccount
      ? 'Rating pending until every player has an account'
      : null;
  const typeLabel = match.league_id != null ? 'League game' : 'Pickup game';
  const resultText = outcome === 'pending'
    ? sessionIsOpen ? 'Session open' : 'Pending'
    : outcomeLabel;
  const resultColor = outcome === 'win'
    ? 'text-success'
    : outcome === 'loss'
      ? 'text-danger'
      : 'text-warning';
  const accessibilityLabel = [
    outcomeLabel, match.score, typeLabel, partnerLabel, opponentsLabel, statusLabel, meta,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View className="mb-xs flex-row flex-wrap items-baseline gap-x-sm">
        {match.score != null && match.score !== '' && (
          <AppText className="text-title3 font-bold text-brand-teal">{match.score}</AppText>
        )}
        <AppText className={`text-caption font-semibold ${resultColor}`}>
          {resultText}
        </AppText>
      </View>
      <AppText className="text-caption text-muted">
        <AppText className="font-semibold text-default">You</AppText>
        {match.partner ? ' / ' : ''}
        <AppText
          className={match.partner_is_placeholder ? 'italic text-warning' : ''}
        >
          {match.partner ?? ''}
        </AppText>
      </AppText>
      <AppText className="text-caption text-muted">
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
      {(meta !== '' || showSessionStatusInMeta) && (
        <AppText className="mt-xs text-[11px] text-tertiary">
          {meta}
          {meta !== '' && showSessionStatusInMeta ? ' · ' : null}
          {showSessionStatusInMeta && (
            <AppText className="text-muted">Session open</AppText>
          )}
        </AppText>
      )}
    </>
  );

  if (!hasDestination) {
    return (
      <View className="grow min-h-touch bg-surface rounded-card p-sm border border-divider">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(routes.session(sessionId))}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className="grow min-h-touch bg-surface rounded-card p-sm border border-divider"
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
      <View className="bg-surface rounded-card p-md items-center">
        <AppText className="text-footnote text-tertiary">No games yet</AppText>
      </View>
    );
  }

  return (
    <HomePreviewRow testID="recent-games-row">
      {visible.map((match, idx) => (
        <GameCard key={(match.id as number | undefined) ?? idx} match={match} />
      ))}
    </HomePreviewRow>
  );
}
