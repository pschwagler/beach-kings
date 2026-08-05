/**
 * Empty state for the Courts list when no courts match the current filter.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import type { CourtFilterChip } from './useCourtsScreen';
import { getCourtFilterPresentation } from './courtFilters';
import { usePaletteColors } from '@/theme/usePaletteColors';

function LocationIcon(): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        stroke={palette.brandTeal}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9} r={2.5} stroke={palette.brandTeal} strokeWidth={1.5} />
    </Svg>
  );
}

interface CourtsEmptyStateProps {
  readonly activeFilter: CourtFilterChip | null;
  readonly onClearFilter?: () => void;
  readonly searchQuery?: string;
  readonly onClearSearch?: () => void;
  readonly isCatalogEmpty?: boolean;
}

export default function CourtsEmptyState({
  activeFilter,
  onClearFilter,
  searchQuery = '',
  onClearSearch,
  isCatalogEmpty = false,
}: CourtsEmptyStateProps): React.ReactNode {
  if (searchQuery.trim().length > 0) {
    return (
      <EmptyStateContent
        title="No courts found"
        message={`No courts match “${searchQuery.trim()}.” Try another search or clear it to browse all courts.`}
        buttonLabel="Clear Search"
        buttonTestID="courts-clear-search-btn"
        onPress={onClearSearch}
      />
    );
  }

  if (activeFilter != null) {
    const presentation = getCourtFilterPresentation(activeFilter);
    return (
      <View
        testID="courts-empty-state"
        className="flex-1 items-center justify-center px-8 py-16"
      >
        <View className="w-20 h-20 rounded-full bg-info-tint items-center justify-center mb-5">
          <LocationIcon />
        </View>

        <AppText className="text-[20px] font-bold text-default mb-2 text-center">
          {presentation.emptyTitle}
        </AppText>

        <AppText className="text-[14px] text-tertiary text-center leading-[1.5] mb-8">
          {presentation.emptyMessage}
        </AppText>

        {onClearFilter != null && (
          <Pressable
            testID="courts-clear-filter-btn"
            onPress={onClearFilter}
            accessibilityRole="button"
            accessibilityLabel="Clear Filter"
            className="bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
          >
            <AppText className="text-on-brand-gold font-bold text-[15px]">Clear Filter</AppText>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <EmptyStateContent
      title={isCatalogEmpty ? 'No courts yet' : 'No nearby courts'}
      message={isCatalogEmpty
        ? 'The court directory is empty right now. Check back soon.'
        : 'Try another filter or search for a city, address, or court name.'}
    />
  );
}

function EmptyStateContent({
  title,
  message,
  buttonLabel,
  buttonTestID,
  onPress,
}: {
  readonly title: string;
  readonly message: string;
  readonly buttonLabel?: string;
  readonly buttonTestID?: string;
  readonly onPress?: () => void;
}): React.ReactNode {
  return (
    <View testID="courts-empty-state" className="flex-1 items-center justify-center px-8 py-16">
      <View className="w-20 h-20 rounded-full bg-info-tint items-center justify-center mb-5">
        <LocationIcon />
      </View>
      <AppText className="text-[20px] font-bold text-default mb-2 text-center">{title}</AppText>
      <AppText className="text-[14px] text-tertiary text-center leading-[1.5] mb-8">{message}</AppText>
      {onPress != null && buttonLabel != null && (
        <Pressable
          testID={buttonTestID}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          className="min-h-touch bg-brand-gold px-8 rounded-[10px] items-center justify-center active:opacity-80"
        >
          <AppText className="text-on-brand-gold font-bold text-[15px]">{buttonLabel}</AppText>
        </Pressable>
      )}
    </View>
  );
}
