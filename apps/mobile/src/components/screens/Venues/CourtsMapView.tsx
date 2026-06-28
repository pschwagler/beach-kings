/**
 * CourtsMapView — full-screen, interactive map of all courts with coordinates.
 *
 * A thin wrapper over the shared {@link CourtsMap} surface. Tapping a marker
 * calls `onSelectCourt` so the parent (CourtsScreen) can navigate to detail.
 */

import React from 'react';
import CourtsMap from './CourtsMap';
import type { LatLng } from '@/utils/mapRegion';
import type { Court } from '@beach-kings/shared';

/** @deprecated Use `LatLng` from `@/utils/mapRegion`. Kept for existing imports. */
export type UserLocation = LatLng;

export interface CourtsMapViewProps {
  /** Courts list; only those with latitude + longitude will be pinned. */
  readonly courts: readonly Court[];
  /** Called when the user taps a marker. */
  readonly onSelectCourt: (court: Court) => void;
  /** Optional current user location; used to center the map. */
  readonly userLocation?: LatLng | null;
}

export default function CourtsMapView({
  courts,
  onSelectCourt,
  userLocation,
}: CourtsMapViewProps): React.ReactNode {
  return (
    <CourtsMap
      testID="courts-map-view"
      courts={courts}
      userLocation={userLocation}
      onSelectCourt={onSelectCourt}
    />
  );
}
