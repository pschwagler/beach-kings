/**
 * SegmentControl component — iOS-style segment tabs.
 * Selected: teal bg + white text. Unselected: transparent + muted text.
 * Segments fill equally within a rounded container.
 */

import React from 'react';
import { View, Pressable, Text } from 'react-native';

interface SegmentControlProps {
  readonly segments: string[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly className?: string;
}

export default function SegmentControl({
  segments,
  selectedIndex,
  onSelect,
  className = '',
}: SegmentControlProps): React.ReactNode {
  return (
    <View
      className={`flex-row bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`}
    >
      {segments.map((segment, index) => (
        <Pressable
          key={segment}
          onPress={() => onSelect(index)}
          className={`flex-1 min-h-touch items-center justify-center rounded-md ${
            index === selectedIndex
              ? 'bg-primary dark:bg-brand-teal'
              : 'bg-transparent'
          }`}
          accessibilityRole="tab"
          accessibilityState={{ selected: index === selectedIndex }}
          accessibilityLabel={segment}
        >
          <Text
            className={`text-sm font-medium ${
              index === selectedIndex
                ? 'text-white'
                : 'text-text-muted dark:text-text-tertiary'
            }`}
          >
            {segment}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
