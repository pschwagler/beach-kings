/**
 * Section title + right-aligned link for the Home dashboard.
 * Mirrors `home.html` `.section-header`.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';

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
      <AppText className="text-callout font-bold text-default">{title}</AppText>
      {linkLabel != null && onLinkPress != null && (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="link"
          accessibilityLabel={`${linkLabel}, ${title}`}
          hitSlop={8}
        >
          <AppText className="text-footnote font-medium text-brand-teal">
            {linkLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
