/**
 * TabView — horizontal scrollable tab bar with teal active indicator.
 * Active tab has a 2px teal underline; inactive tabs have muted text.
 */

import React from 'react';
import { ScrollView, Pressable, View } from 'react-native';
import AppText from './AppText';
import {
  selectionAccessibilityLabel,
  selectionAccessibilityValue,
  type SelectionControlItem,
} from './selectionControlTypes';
import { usePaletteColors } from '@/theme/usePaletteColors';
import HorizontalOverflowAffordance from './HorizontalOverflowAffordance';
import { useHorizontalOverflow } from './useHorizontalOverflow';

interface TabViewBaseProps {
  readonly className?: string;
  readonly testID?: string;
  readonly tabTestIDPrefix?: string;
}

interface KeyedTabViewProps<Value extends string> {
  readonly items: readonly SelectionControlItem<Value>[];
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
}

export type TabViewProps<Value extends string> =
  TabViewBaseProps & KeyedTabViewProps<Value>;

export default function TabView<Value extends string = string>(
  props: TabViewProps<Value>,
): React.ReactNode {
  const {
    className = '',
    testID,
    tabTestIDPrefix,
    items,
    value,
    onValueChange,
  } = props;
  const palette = usePaletteColors();
  const overflow = useHorizontalOverflow(value);

  return (
    <View className={`relative grow-0 shrink-0 border-b border-divider ${className}`}>
      <ScrollView
        ref={overflow.scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={testID}
        accessibilityRole="tablist"
        accessibilityHint={overflow.canScrollForward || overflow.canScrollBackward
          ? 'Swipe left or right to see more tabs'
          : undefined}
        style={{ flexGrow: 0 }}
        contentContainerClassName="flex-row pr-7"
        onLayout={overflow.onLayout}
        onContentSizeChange={overflow.onContentSizeChange}
        onScroll={overflow.onScroll}
        scrollEventThrottle={16}
      >
        {items.map((item, index) => {
        const isActive = item.value === value;
        return (
          <Pressable
            key={item.value}
            testID={
              item.testID ??
              (tabTestIDPrefix != null ? `${tabTestIDPrefix}-${item.value}` : undefined)
            }
            disabled={item.disabled}
            onLayout={(event) => overflow.onItemLayout(item.value, event)}
            onPress={() => {
              overflow.centerItem(item.value);
              onValueChange(item.value);
            }}
            className={`min-h-touch min-w-[88px] px-4 py-2 justify-center items-center ${
              item.disabled === true ? 'opacity-disabled' : ''
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled: item.disabled }}
            accessibilityLabel={selectionAccessibilityLabel(item)}
            accessibilityValue={selectionAccessibilityValue(index, items.length)}
          >
            <View className="flex-row items-center justify-center gap-1">
              <AppText
                className={`text-sm text-center font-medium ${
                  isActive ? 'text-brand-teal' : 'text-muted'
                }`}
                style={{ color: isActive ? palette.brandTeal : palette.textMuted }}
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
            </View>
            {isActive && (
              <View
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-teal"
                style={{ backgroundColor: palette.brandTeal }}
              />
            )}
          </Pressable>
        );
        })}
      </ScrollView>
      <HorizontalOverflowAffordance
        backward={overflow.canScrollBackward}
        forward={overflow.canScrollForward}
      />
    </View>
  );
}
