/**
 * Horizontal filter chip bar for the Courts list screen.
 *
 * Chips: Nearby · My Courts · Top Rated · Indoor · Outdoor · Lighted
 */

import React, { useCallback } from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import type { CourtFilterChip } from './useCourtsScreen';
import { COURT_FILTERS } from './courtFilters';

interface CourtsFilterBarProps {
  readonly activeFilter: CourtFilterChip | null;
  readonly onFilterChange: (filter: CourtFilterChip | null) => void;
}

export default function CourtsFilterBar({
  activeFilter,
  onFilterChange,
}: CourtsFilterBarProps): React.ReactNode {
  const handleChipPress = useCallback(
    (id: CourtFilterChip) => {
      void hapticLight();
      onFilterChange(activeFilter === id ? null : id);
    },
    [activeFilter, onFilterChange],
  );

  return (
    <ScrollView
      testID="courts-filter-bar"
      horizontal
      showsHorizontalScrollIndicator={false}
      className="border-b border-strong"
      contentContainerClassName="flex-row gap-2 px-4 py-3"
    >
      {COURT_FILTERS.map((chip) => {
        const isActive = activeFilter === chip.id;
        return (
          <Pressable
            key={chip.id}
            testID={`filter-court-${chip.id}`}
            onPress={() => handleChipPress(chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={chip.label}
            className={`px-4 py-1.5 rounded-full border ${
              isActive
                ? 'bg-brand-teal border-brand-teal'
                : 'bg-surface border-strong'
            } active:opacity-80`}
          >
            <Text
              className={`text-[13px] font-medium ${
                isActive
                  ? 'text-white'
                  : 'text-muted'
              }`}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
