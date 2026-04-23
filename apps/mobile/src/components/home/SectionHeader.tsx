/**
 * Section title + right-aligned link for the Home dashboard.
 * Mirrors `home.html` `.section-header`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface SectionHeaderProps {
  readonly title: string;
  readonly linkLabel?: string;
  readonly onLinkPress?: () => void;
}

export default function SectionHeader({
  title,
  linkLabel,
  onLinkPress,
}: SectionHeaderProps): React.ReactNode {
  return (
    <View className="flex-row justify-between items-center mb-sm">
      <Text className="text-callout font-bold text-text-default dark:text-content-primary">
        {title}
      </Text>
      {linkLabel != null && onLinkPress != null && (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="link"
          accessibilityLabel={linkLabel}
          hitSlop={8}
        >
          <Text className="text-footnote font-medium text-accent dark:text-brand-teal">
            {linkLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
