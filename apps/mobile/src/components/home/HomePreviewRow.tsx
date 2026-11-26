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

  const cardCount = Children.count(children);

  if (cardCount < 2 || fontScale >= 1.6 || sectionWidth < 300) {
    return <View className="gap-sm">{children}</View>;
  }

  if (cardCount === 2) {
    return (
      <View testID={testID} className="flex-row gap-sm">
        {Children.map(children, (card) => (
          <View className="flex-1 min-w-0">{card}</View>
        ))}
      </View>
    );
  }

  // Keep two complete cards in the viewport, including at the end of the row.
  const cardWidth = (sectionWidth - spacing.sm) / 2;
  return (
    <ScrollView
      horizontal
      testID={testID}
      snapToInterval={cardWidth + spacing.sm}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      {Children.map(children, (card) => (
        <View style={{ width: cardWidth }}>{card}</View>
      ))}
    </ScrollView>
  );
}
