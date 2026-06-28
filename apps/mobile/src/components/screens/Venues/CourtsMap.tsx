/**
 * CourtsMap — shared courts map surface (markers + region + empty fallback).
 *
 * Used by both the full-screen map (CourtsMapView) and the list-header preview
 * (CourtsMapPreview). Interactivity is configurable so the preview can render a
 * static, tap-through map while the full view stays interactive.
 *
 * Display-only: it owns no data fetching. Coordinates and selection are passed
 * in by the parent.
 */

import React, { useMemo } from 'react';
import { View, Text, Platform, type StyleProp, type ViewStyle } from 'react-native';
import MapView from 'react-native-maps';
import CourtMarker from './CourtMarker';
import { computeRegion, courtsWithCoords, type LatLng } from '@/utils/mapRegion';
import type { Court } from '@beach-kings/shared';

export interface CourtsMapProps {
  /** Courts list; only those with latitude + longitude are pinned. */
  readonly courts: readonly Court[];
  /** Optional current-user location used to center the map and show the dot. */
  readonly userLocation?: LatLng | null;
  /** Called when a marker is tapped. Omit for a non-selectable map. */
  readonly onSelectCourt?: (court: Court) => void;
  /** When false, the map is static (no gestures, taps pass through). Default true. */
  readonly interactive?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  /** Label shown when there is nothing to render. */
  readonly emptyLabel?: string;
}

export default function CourtsMap({
  courts,
  userLocation,
  onSelectCourt,
  interactive = true,
  style,
  testID = 'courts-map',
  emptyLabel = 'No courts with map data',
}: CourtsMapProps): React.ReactNode {
  const pinnedCourts = useMemo(() => courtsWithCoords(courts), [courts]);

  const pinnedCoords = useMemo<LatLng[]>(
    () => pinnedCourts.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
    [pinnedCourts],
  );

  const region = useMemo(
    () => computeRegion(pinnedCoords, userLocation),
    [pinnedCoords, userLocation],
  );

  if (pinnedCourts.length === 0 && userLocation == null) {
    return (
      <View testID={testID} className="flex-1 items-center justify-center bg-surface" style={style}>
        <Text className="text-[14px] text-muted">{emptyLabel}</Text>
      </View>
    );
  }

  const staticProps = interactive
    ? {}
    : {
        liteMode: Platform.OS === 'android',
        scrollEnabled: false,
        zoomEnabled: false,
        rotateEnabled: false,
        pitchEnabled: false,
        pointerEvents: 'none' as const,
      };

  return (
    <View testID={testID} style={style} className="flex-1">
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation={userLocation != null}
        {...staticProps}
      >
        {pinnedCourts.map((court) => (
          <CourtMarker key={String(court.id)} court={court} onPress={onSelectCourt} />
        ))}
      </MapView>
    </View>
  );
}
