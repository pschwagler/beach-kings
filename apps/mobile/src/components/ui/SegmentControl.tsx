/**
 * SegmentControl component — iOS-style segment tabs.
 * Selected: teal bg + white text. Unselected: transparent + muted text.
 * Segments fill equally within a rounded container.
 */

import React from 'react';
import { View, Pressable, Text } from 'react-native';

interface SegmentControlProps {
  readonly segments: readonly string[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly className?: string;
  readonly testID?: string;
  readonly segmentTestIDPrefix?: string;
  readonly segmentTestIDs?: readonly string[];
  readonly compact?: boolean;
}

export default function SegmentControl({
  segments,
  selectedIndex,
  onSelect,
  className = '',
  testID,
  segmentTestIDPrefix,
  segmentTestIDs,
  compact = false,
}: SegmentControlProps): React.ReactNode {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      className={`flex-row bg-elevated rounded-lg border border-divider p-1 ${className}`}
    >
      {segments.map((segment, index) => (
        <Pressable
          key={segment}
          testID={
            segmentTestIDs?.[index] ??
            (segmentTestIDPrefix != null ? `${segmentTestIDPrefix}-${index}` : undefined)
          }
          onPress={() => onSelect(index)}
          className={`flex-1 min-h-touch items-center justify-center rounded-md ${
            index === selectedIndex
              ? 'bg-brand-teal'
              : 'bg-transparent'
          }`}
          accessibilityRole="tab"
          accessibilityState={{ selected: index === selectedIndex }}
          accessibilityLabel={segment}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className={`${compact ? 'text-[12px]' : 'text-sm'} font-medium ${
              index === selectedIndex
                ? 'text-white'
                : 'text-muted'
            }`}
          >
            {segment}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
