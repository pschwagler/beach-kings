import React, { Children, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { spacing } from '@beach-kings/shared/tokens/spacing';

export default function HomePreviewRow({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID: string;
}): ReactNode {
  const { width, fontScale } = useWindowDimensions();
  const sectionWidth = width - 2 * spacing.lg;

  if (Children.count(children) < 2 || fontScale >= 1.6 || sectionWidth < 300) {
    return <View className="gap-sm">{children}</View>;
  }

  // Leave part of the next card visible when the whole row cannot fit.
  const cardWidth = Math.min(320, sectionWidth - spacing.xxxl);
  return (
    <ScrollView
      horizontal
      testID={testID}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      {Children.map(children, (card) => (
        <View style={{ width: cardWidth }}>{card}</View>
      ))}
    </ScrollView>
  );
}
