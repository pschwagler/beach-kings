/**
 * Section title and optional link for the Home dashboard.
 * Mirrors `home.html` `.section-header`.
 */

import React from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
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
  const { fontScale } = useWindowDimensions();
  const stack = fontScale >= 1.6;

  return (
    <View
      testID={`home-section-header-${title}`}
      className="mb-sm justify-between gap-x-sm"
      style={{
        flexDirection: stack ? 'column' : 'row',
        flexWrap: stack ? 'nowrap' : 'wrap',
        alignItems: stack ? 'flex-start' : 'center',
      }}
    >
      <AppText className="max-w-full text-callout font-bold text-default">{title}</AppText>
      {linkLabel != null && onLinkPress != null && (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="link"
          accessibilityLabel={`${linkLabel}, ${title}`}
          className="max-w-full shrink-0"
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
