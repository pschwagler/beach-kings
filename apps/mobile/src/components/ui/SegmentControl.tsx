/**
 * SegmentControl component — iOS-style segment tabs.
 * Selected: teal bg + white text. Unselected: transparent + muted text.
 * Segments fill equally within a rounded container and scroll rather than
 * shrinking text when accessibility font sizes need more room.
 */

import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import AppText from './AppText';
import {
  selectionAccessibilityLabel,
  selectionAccessibilityValue,
  type SelectionControlItem,
} from './selectionControlTypes';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface SegmentControlBaseProps {
  readonly className?: string;
  readonly testID?: string;
  readonly segmentTestIDPrefix?: string;
  readonly compact?: boolean;
}

interface KeyedSegmentControlProps<Value extends string> {
  readonly items: readonly SelectionControlItem<Value>[];
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
}

export type SegmentControlProps<Value extends string> =
  SegmentControlBaseProps & KeyedSegmentControlProps<Value>;

export default function SegmentControl<Value extends string = string>(
  props: SegmentControlProps<Value>,
): React.ReactNode {
  const {
    className = '',
    testID,
    segmentTestIDPrefix,
    compact = false,
    items,
    value,
    onValueChange,
  } = props;
  const palette = usePaletteColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexGrow: 0 }}
      className={`flex-row bg-elevated rounded-lg border border-divider p-1 ${className}`}
      contentContainerClassName="flex-row grow"
      contentContainerStyle={{ alignItems: 'stretch' }}
    >
      {items.map((item, index) => {
        const isSelected = item.value === value;
        const resolvedTestID =
          item.testID ??
          (segmentTestIDPrefix != null ? `${segmentTestIDPrefix}-${item.value}` : undefined);

        return (
          <Pressable
            key={item.value}
            testID={resolvedTestID}
            disabled={item.disabled}
            onPress={() => onValueChange(item.value)}
            style={{
              minWidth: compact ? 76 : 96,
              flexGrow: 1,
              flexBasis: 0,
              backgroundColor: isSelected ? palette.brandTeal : 'transparent',
            }}
            className={`min-h-touch px-3 py-2 items-center justify-center rounded-md ${
              isSelected ? 'bg-brand-teal' : 'bg-transparent'
            } ${item.disabled === true ? 'opacity-disabled' : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected, disabled: item.disabled }}
            accessibilityLabel={selectionAccessibilityLabel(item)}
            accessibilityValue={selectionAccessibilityValue(index, items.length)}
          >
            <View className="flex-row items-center justify-center gap-1">
              <AppText
                className={`${compact ? 'text-[12px]' : 'text-sm'} text-center font-medium ${
                  isSelected ? 'text-on-brand-teal' : 'text-muted'
                }`}
                style={{
                  color: isSelected ? palette.onBrandTeal : palette.textMuted,
                }}
              >
                {item.label}
              </AppText>
              {item.badge != null && (
                <View className="min-w-[20px] min-h-[20px] px-1 rounded-full bg-surface items-center justify-center">
                  <AppText className="text-[11px] font-semibold text-default">
                    {item.badge}
                  </AppText>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
