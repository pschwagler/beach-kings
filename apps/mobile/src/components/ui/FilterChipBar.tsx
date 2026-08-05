/** Horizontally scrollable, single-select browse filters. */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import AppText from './AppText';
import {
  selectionAccessibilityLabel,
  type SelectionControlItem,
} from './selectionControlTypes';

export interface FilterChipBarProps<Value extends string> {
  readonly items: readonly SelectionControlItem<Value>[];
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly testID?: string;
  readonly chipTestIDPrefix?: string;
  readonly accessibilityLabel?: string;
}

export default function FilterChipBar<Value extends string>({
  items,
  value,
  onValueChange,
  className = '',
  contentClassName = '',
  testID,
  chipTestIDPrefix,
  accessibilityLabel = 'Filters',
}: FilterChipBarProps<Value>): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID}
      accessibilityRole="toolbar"
      accessibilityLabel={accessibilityLabel}
      style={{ flexGrow: 0 }}
      className={className}
      contentContainerClassName={`flex-row gap-2 px-4 ${contentClassName}`}
    >
      {items.map((item) => {
        const isSelected = item.value === value;
        return (
          <Pressable
            key={item.value}
            testID={
              item.testID ??
              (chipTestIDPrefix != null ? `${chipTestIDPrefix}-${item.value}` : undefined)
            }
            disabled={item.disabled}
            onPress={() => onValueChange(item.value)}
            accessibilityRole="button"
            accessibilityLabel={selectionAccessibilityLabel(item)}
            accessibilityState={{ selected: isSelected, disabled: item.disabled }}
            className={`min-h-touch min-w-touch flex-row items-center justify-center gap-1 rounded-full border px-4 py-2 ${
              isSelected
                ? 'bg-brand-teal border-brand-teal'
                : 'bg-surface border-divider'
            } ${item.disabled === true ? 'opacity-disabled' : ''}`}
          >
            <AppText
              className={`text-sm font-medium ${
                isSelected ? 'text-on-brand-teal' : 'text-default'
              }`}
            >
              {item.label}
            </AppText>
            {item.badge != null && (
              <View className="min-w-[20px] min-h-[20px] px-1 rounded-full bg-elevated items-center justify-center">
                <AppText className="text-[11px] font-semibold text-default">
                  {item.badge}
                </AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
