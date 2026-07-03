/**
 * "Coming soon" placeholder for the Tournaments section.
 *
 * Tournaments (KoB events, brackets) are not yet backed by real data, so the
 * section shows a non-interactive teaser rather than linking into unfinished
 * screens. Restore the browse/create CTAs once the backend is live.
 */

import React from 'react';
import { View, Text } from 'react-native';

export default function TournamentsEmpty(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-xl items-center border-[1.5px] border-dashed border-divider shadow-sm dark:shadow-none">
      <Text className="text-subhead font-semibold text-default mb-1 text-center">
        Coming soon to a beach near you
      </Text>
      <Text className="text-caption text-tertiary text-center">
        KoB events and brackets are on the way
      </Text>
    </View>
  );
}
