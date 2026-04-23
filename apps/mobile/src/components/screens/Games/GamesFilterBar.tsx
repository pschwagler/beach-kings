/**
 * GamesFilterBar — horizontal filter selects for the My Games screen.
 *
 * Matches the `.filter-bar` shape in my-games.html:
 *   All Leagues dropdown | All Results dropdown
 *
 * Note: The "All Partners" filter from the wireframe is omitted from this
 * implementation as the backend doesn't expose partner filtering yet.
 * The two primary filters (league + result) are the ones backed by API params.
 */

import React, { useCallback } from 'react';
import { View, Pressable, Text, ScrollView } from 'react-native';
import type { ResultFilter } from './useMyGamesScreen';

// ---------------------------------------------------------------------------
// Chip-style filter button (iOS-friendly replace for HTML <select>)
// ---------------------------------------------------------------------------

interface FilterChipProps {
  readonly label: string;
  readonly isActive: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
}

function FilterChip({
  label,
  isActive,
  testID,
  onPress,
}: FilterChipProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`px-3 py-[9px] rounded-[8px] border mr-2 ${
        isActive
          ? 'bg-navy dark:bg-content-primary border-navy dark:border-content-primary'
          : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-border-subtle'
      }`}
    >
      <Text
        className={`text-[12px] font-semibold ${
          isActive
            ? 'text-white'
            : 'text-text-muted dark:text-content-secondary'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Result filter pill group
// ---------------------------------------------------------------------------

const RESULT_OPTIONS: { label: string; value: ResultFilter }[] = [
  { label: 'All Results', value: 'all' },
  { label: 'Wins', value: 'win' },
  { label: 'Losses', value: 'loss' },
];

interface GamesFilterBarProps {
  readonly resultFilter: ResultFilter;
  readonly onResultChange: (r: ResultFilter) => void;
  readonly leagueFilter: number | null;
  readonly onLeagueClear: () => void;
  /** If provided, shows a league-active chip label. */
  readonly activeLeagueName?: string | null;
}

export default function GamesFilterBar({
  resultFilter,
  onResultChange,
  leagueFilter,
  onLeagueClear,
  activeLeagueName,
}: GamesFilterBarProps): React.ReactNode {
  const handleResultPress = useCallback(
    (value: ResultFilter) => () => {
      onResultChange(value);
    },
    [onResultChange],
  );

  return (
    <View
      testID="games-filter-bar"
      className="bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-border-subtle"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
      >
        {/* League chip — only shown when a league is active */}
        {leagueFilter != null && (
          <FilterChip
            testID="filter-league-active"
            label={activeLeagueName ?? `League #${leagueFilter} x`}
            isActive
            onPress={onLeagueClear}
          />
        )}

        {/* Result filters */}
        {RESULT_OPTIONS.map(({ label, value }) => (
          <FilterChip
            key={value}
            testID={`filter-result-${value}`}
            label={label}
            isActive={resultFilter === value}
            onPress={handleResultPress(value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
