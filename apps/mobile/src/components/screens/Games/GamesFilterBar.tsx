/**
 * GamesFilterBar — horizontal filter chips for the My Games screen.
 *
 * Primary row: All Results | Wins | Losses | Partner | Opponent
 *
 * When "Partner" or "Opponent" is active, a secondary chip row appears
 * listing each unique name from the loaded games for sub-selection.
 * Sub-selection filtering is handled client-side in useMyGamesScreen.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import FilterChipBar from '@/components/ui/FilterChipBar';
import type { ResultFilter } from './useMyGamesScreen';

const RESULT_OPTIONS = [
  { label: 'All Results', value: 'all', testID: 'filter-result-all' },
  { label: 'Wins', value: 'W', testID: 'filter-result-W' },
  { label: 'Losses', value: 'L', testID: 'filter-result-L' },
  { label: 'Partner', value: 'partner', testID: 'filter-result-partner' },
  { label: 'Opponent', value: 'opponent', testID: 'filter-result-opponent' },
] as const;

interface GamesFilterBarProps {
  readonly resultFilter: ResultFilter;
  readonly onResultChange: (r: ResultFilter) => void;
  readonly leagueFilter: number | null;
  readonly onLeagueClear: () => void;
  readonly activeLeagueName?: string | null;
  readonly availablePartners: readonly string[];
  readonly availableOpponents: readonly string[];
  readonly selectedPartner: string | null;
  readonly selectedOpponent: string | null;
  readonly onPartnerSelect: (name: string | null) => void;
  readonly onOpponentSelect: (name: string | null) => void;
}

export default function GamesFilterBar({
  resultFilter,
  onResultChange,
  leagueFilter,
  onLeagueClear,
  activeLeagueName,
  availablePartners,
  availableOpponents,
  selectedPartner,
  selectedOpponent,
  onPartnerSelect,
  onOpponentSelect,
}: GamesFilterBarProps): React.ReactNode {
  const showPartnerRow = resultFilter === 'partner' && availablePartners.length > 0;
  const showOpponentRow = resultFilter === 'opponent' && availableOpponents.length > 0;

  return (
    <View
      testID="games-filter-bar"
      className="bg-surface border-b border-divider"
    >
      {leagueFilter != null && (
        <View className="px-4 pt-2">
          <Pressable
            testID="filter-league-active"
            onPress={onLeagueClear}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${activeLeagueName ?? `League ${leagueFilter}`} filter`}
            className="self-start min-h-touch justify-center rounded-full border border-brand-teal bg-info-tint px-4"
          >
            <AppText className="text-sm font-medium text-brand-teal">
              {activeLeagueName ?? `League #${leagueFilter}`} ×
            </AppText>
          </Pressable>
        </View>
      )}
      <FilterChipBar
        items={RESULT_OPTIONS}
        value={resultFilter}
        onValueChange={onResultChange}
        accessibilityLabel="Game result filters"
        contentClassName="py-2"
      />

      {showPartnerRow && (
        <View
          testID="partner-filter-row"
          className="border-t border-divider"
        >
          <FilterChipBar
            items={[
              { value: '__all__', label: 'All Partners' },
              ...availablePartners.map((name) => ({ value: name, label: name })),
            ]}
            value={selectedPartner ?? '__all__'}
            onValueChange={(value) => onPartnerSelect(value === '__all__' ? null : value)}
            accessibilityLabel="Partner filters"
            contentClassName="py-2"
          />
        </View>
      )}

      {showOpponentRow && (
        <View
          testID="opponent-filter-row"
          className="border-t border-divider"
        >
          <FilterChipBar
            items={[
              { value: '__all__', label: 'All Opponents' },
              ...availableOpponents.map((name) => ({ value: name, label: name })),
            ]}
            value={selectedOpponent ?? '__all__'}
            onValueChange={(value) => onOpponentSelect(value === '__all__' ? null : value)}
            accessibilityLabel="Opponent filters"
            contentClassName="py-2"
          />
        </View>
      )}
    </View>
  );
}
