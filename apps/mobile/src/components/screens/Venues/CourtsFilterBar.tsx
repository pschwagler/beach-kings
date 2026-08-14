/**
 * Horizontal filter chip bar for the Courts list screen.
 *
 * Chips: Nearby · My Courts · Top Rated · Indoor · Outdoor · Lighted
 */

import React, { useCallback } from 'react';
import { hapticLight } from '@/utils/haptics';
import FilterChipBar from '@/components/ui/FilterChipBar';
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
    <FilterChipBar
      testID="courts-filter-bar"
      accessibilityLabel="Court filters"
      items={COURT_FILTERS.map((chip) => ({
        value: chip.id,
        label: chip.label,
        testID: `filter-court-${chip.id}`,
      }))}
      value={activeFilter ?? 'nearby'}
      onValueChange={handleChipPress}
      className="border-b border-strong"
      contentClassName="py-1"
    />
  );
}
