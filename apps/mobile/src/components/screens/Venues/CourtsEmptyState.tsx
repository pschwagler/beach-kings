/**
 * Empty state for the Courts list when no courts match the current filter.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

function LocationIcon(): React.ReactNode {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        stroke="#2a7d9c"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9} r={2.5} stroke="#2a7d9c" strokeWidth={1.5} />
    </Svg>
  );
}

interface CourtsEmptyStateProps {
  readonly hasActiveFilter: boolean;
  readonly onEnableLocation?: () => void;
  readonly onClearFilter?: () => void;
}

export default function CourtsEmptyState({
  hasActiveFilter,
  onEnableLocation,
  onClearFilter,
}: CourtsEmptyStateProps): React.ReactNode {
  if (hasActiveFilter) {
    return (
      <View
        testID="courts-empty-state"
        className="flex-1 items-center justify-center px-8 py-16"
      >
        <View className="w-20 h-20 rounded-full bg-teal-50 dark:bg-info-bg items-center justify-center mb-5">
          <LocationIcon />
        </View>

        <Text className="text-[20px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
          No Courts Found
        </Text>

        <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5] mb-8">
          No courts match your current filter. Try a different filter or clear it
          to see all courts.
        </Text>

        {onClearFilter != null && (
          <Pressable
            testID="courts-clear-filter-btn"
            onPress={onClearFilter}
            accessibilityRole="button"
            accessibilityLabel="Clear Filter"
            className="bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
          >
            <Text className="text-white font-bold text-[15px]">Clear Filter</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View
      testID="courts-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <View className="w-20 h-20 rounded-full bg-teal-50 dark:bg-info-bg items-center justify-center mb-5">
        <LocationIcon />
      </View>

      <Text className="text-[20px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        Enable Location
      </Text>

      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5] mb-8">
        Allow location access to discover beach volleyball courts near you.
      </Text>

      {onEnableLocation != null && (
        <Pressable
          testID="courts-enable-location-btn"
          onPress={onEnableLocation}
          accessibilityRole="button"
          accessibilityLabel="Enable Location"
          className="bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
        >
          <Text className="text-white font-bold text-[15px]">Enable Location</Text>
        </Pressable>
      )}
    </View>
  );
}
