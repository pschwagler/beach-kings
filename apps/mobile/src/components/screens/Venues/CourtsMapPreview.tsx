/**
 * CourtsMapPreview — the list-header map teaser on the Courts screen.
 *
 * Replaces the old static placeholder with a real (non-interactive) map of the
 * nearby courts plus the user's location dot. A "View Full Map" button overlays
 * the bottom edge and switches the screen to full-map mode.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import CourtsMap from './CourtsMap';
import type { LatLng } from '@/utils/mapRegion';
import type { Court } from '@beach-kings/shared';

export interface CourtsMapPreviewProps {
  readonly courts: readonly Court[];
  readonly userLocation?: LatLng | null;
  readonly onViewFullMap: () => void;
}

export default function CourtsMapPreview({
  courts,
  userLocation,
  onViewFullMap,
}: CourtsMapPreviewProps): React.ReactNode {
  return (
    <View testID="courts-map-stub" className="h-[180px] border-b border-strong">
      <CourtsMap
        testID="courts-map-preview-map"
        courts={courts}
        userLocation={userLocation}
        interactive={false}
        emptyLabel="Map view"
      />

      {/* box-none lets map gestures through except on the button itself */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 bottom-3 items-center"
      >
        <Pressable
          testID="courts-view-full-map-btn"
          accessibilityRole="button"
          accessibilityLabel="View Full Map"
          onPress={onViewFullMap}
          className="px-4 py-2 rounded-lg bg-surface border border-strong active:opacity-80"
        >
          <Text className="text-[13px] font-medium text-brand-teal">
            View Full Map
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
