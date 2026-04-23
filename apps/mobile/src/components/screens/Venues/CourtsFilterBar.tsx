/**
 * Horizontal filter chip bar for the Courts list screen.
 *
 * Chips: Nearby · My Courts · Top Rated · Indoor · Outdoor · Lighted
 */

import React, { useCallback } from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import type { CourtFilterChip } from './useCourtsScreen';

const CHIPS: Array<{ id: CourtFilterChip; label: string }> = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'my-courts', label: 'My Courts' },
  { id: 'top-rated', label: 'Top Rated' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'lighted', label: 'Lighted' },
];

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
      className="border-b border-border dark:border-border-strong"
      contentContainerClassName="flex-row gap-2 px-4 py-3"
    >
      {CHIPS.map((chip) => {
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
                ? 'bg-primary dark:bg-brand-teal border-primary dark:border-brand-teal'
                : 'bg-white dark:bg-dark-surface border-border dark:border-border-strong'
            } active:opacity-80`}
          >
            <Text
              className={`text-[13px] font-medium ${
                isActive
                  ? 'text-white'
                  : 'text-text-secondary dark:text-content-secondary'
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
