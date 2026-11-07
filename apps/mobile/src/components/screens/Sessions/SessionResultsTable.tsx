import React from 'react';
import { View } from 'react-native';
import type { SessionGame } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { buildSessionResults } from '@/features/sessions/results';

interface Props {
  readonly games: readonly SessionGame[];
}

/** All players' session results, independent of the viewer's game filter. */
export default function SessionResultsTable({ games }: Props): React.ReactNode {
  const players = buildSessionResults(games);
  return (
    <View testID="session-results-table" className="bg-surface rounded-xl border border-divider p-3">
      <AppText accessibilityRole="header" className="text-[16px] font-bold text-default mb-2">
        Session results
      </AppText>
      <AppText className="text-[12px] text-muted mb-3">
        Wins, losses and point difference from scored games. Ties and unscored games are excluded.
      </AppText>
      {players.length === 0 ? (
        <AppText className="text-[14px] text-muted">No scored games yet.</AppText>
      ) : (
        <>
          <View className="flex-row border-b border-divider pb-2" accessible accessibilityLabel="Player, wins, losses, point difference">
            <AppText className="flex-1 text-[12px] font-semibold text-muted">Player</AppText>
            <AppText className="w-9 text-center text-[12px] font-semibold text-muted">W</AppText>
            <AppText className="w-9 text-center text-[12px] font-semibold text-muted">L</AppText>
            <AppText className="w-14 text-right text-[12px] font-semibold text-muted">+/−</AppText>
          </View>
          {players.map((player) => (
            <View
              key={player.key}
              testID={`session-result-${player.key}`}
              accessible
              accessibilityLabel={`${player.name}, ${player.wins} wins, ${player.losses} losses, point difference ${player.pointDifferential > 0 ? '+' : ''}${player.pointDifferential}`}
              className="flex-row items-center border-b border-divider py-3"
            >
              <AppText className="flex-1 pr-2 text-[14px] font-semibold text-default">{player.name}</AppText>
              <AppText className="w-9 text-center text-[14px] text-default">{player.wins}</AppText>
              <AppText className="w-9 text-center text-[14px] text-default">{player.losses}</AppText>
              <AppText className="w-14 text-right text-[14px] text-default">{player.pointDifferential > 0 ? '+' : ''}{player.pointDifferential}</AppText>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
