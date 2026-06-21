/**
 * CourtsMapView — full-width map showing all courts that have coordinates.
 *
 * Renders a `MapView` with one `Marker` per court. Tapping a marker calls
 * `onSelectCourt` so the parent can navigate to the court's detail screen.
 *
 * Region logic (priority order):
 *   1. If `userLocation` is provided, center there and fit all pins.
 *   2. Otherwise fit the bounding box of all pin coordinates.
 *   3. If there are no pins, render a default US-wide region.
 *
 * The component is intentionally display-only — it owns no data fetching.
 * Data and navigation are supplied by the parent (CourtsScreen).
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserLocation {
  readonly latitude: number;
  readonly longitude: number;
}

export interface CourtsMapViewProps {
  /** Courts list; only those with latitude + longitude will be pinned. */
  readonly courts: readonly Court[];
  /** Called when the user taps a marker. */
  readonly onSelectCourt: (court: Court) => void;
  /** Optional current user location; used to center the map. */
  readonly userLocation?: UserLocation | null;
}

// ---------------------------------------------------------------------------
// Region helpers
// ---------------------------------------------------------------------------

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Padding added around the bounding box so pins aren't clipped. */
const REGION_PADDING = 0.05;

/** Default region (continental US) used when no pins exist. */
const DEFAULT_REGION: Region = {
  latitude: 37.5,
  longitude: -98.0,
  latitudeDelta: 40,
  longitudeDelta: 60,
};

/**
 * Computes the MapView region that fits all supplied coordinates.
 * Returns `null` when coords is empty.
 */
function fitRegion(
  coords: ReadonlyArray<{ latitude: number; longitude: number }>,
): Region | null {
  if (coords.length === 0) return null;

  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latDelta = maxLat - minLat + REGION_PADDING;
  const lonDelta = maxLon - minLon + REGION_PADDING;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(latDelta, 0.05),
    longitudeDelta: Math.max(lonDelta, 0.05),
  };
}

/**
 * Determines the initial map region.
 *
 * If the user's location is known:
 *   - Include it alongside all court pins for bounding-box calculation.
 * Otherwise:
 *   - Fit only the court pins, or fall back to the default US region.
 */
function computeRegion(
  courtCoords: ReadonlyArray<{ latitude: number; longitude: number }>,
  userLocation: UserLocation | null | undefined,
): Region {
  const allCoords = userLocation != null
    ? [userLocation, ...courtCoords]
    : courtCoords;

  return fitRegion(allCoords) ?? DEFAULT_REGION;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Filters courts that have valid latitude + longitude values. */
function courtsWithCoords(courts: readonly Court[]): Court[] {
  return courts.filter(
    (c): c is Court & { latitude: number; longitude: number } =>
      c.latitude != null && c.longitude != null,
  );
}

/**
 * CourtsMapView displays a full-screen map with a marker for each court that
 * has coordinates. Tapping a marker triggers `onSelectCourt`.
 */
export default function CourtsMapView({
  courts,
  onSelectCourt,
  userLocation,
}: CourtsMapViewProps): React.ReactNode {
  const palette = usePaletteColors();

  const pinnedCourts = useMemo(() => courtsWithCoords(courts), [courts]);

  const pinnedCoords = useMemo(
    () =>
      pinnedCourts.map((c) => ({
        latitude: c.latitude as number,
        longitude: c.longitude as number,
      })),
    [pinnedCourts],
  );

  const region = useMemo(
    () => computeRegion(pinnedCoords, userLocation),
    [pinnedCoords, userLocation],
  );

  if (pinnedCourts.length === 0 && userLocation == null) {
    return (
      <View
        testID="courts-map-view"
        className="flex-1 items-center justify-center bg-surface"
      >
        <Text className="text-[14px] text-muted">No courts with map data</Text>
      </View>
    );
  }

  return (
    <View testID="courts-map-view" className="flex-1">
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation={userLocation != null}
      >
        {pinnedCourts.map((court) => (
          <Marker
            key={String(court.id)}
            coordinate={{
              latitude: court.latitude as number,
              longitude: court.longitude as number,
            }}
            title={court.name}
            description={
              [court.city, court.state].filter(Boolean).join(', ') || undefined
            }
            pinColor={palette.brandTeal}
            onCalloutPress={() => onSelectCourt(court)}
            onPress={() => onSelectCourt(court)}
          />
        ))}
      </MapView>
    </View>
  );
}
