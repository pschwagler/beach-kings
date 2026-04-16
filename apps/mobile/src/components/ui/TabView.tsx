/**
 * TabView — horizontal scrollable tab bar with teal active indicator.
 * Active tab has a 2px teal underline; inactive tabs have muted text.
 */

import React from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';

interface TabViewProps {
  readonly tabs: string[];
  readonly activeIndex: number;
  readonly onTabPress: (index: number) => void;
  readonly className?: string;
}

export default function TabView({
  tabs,
  activeIndex,
  onTabPress,
  className = '',
}: TabViewProps): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={`border-b border-border dark:border-border-strong ${className}`}
      contentContainerClassName="flex-row"
    >
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <Pressable
            key={tab}
            onPress={() => onTabPress(index)}
            className="min-h-touch px-4 justify-center items-center"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab}
          >
            <Text
              className={`text-sm font-medium ${
                isActive
                  ? 'text-primary dark:text-brand-teal'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {tab}
            </Text>
            {isActive && (
              <View className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-brand-teal" />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
