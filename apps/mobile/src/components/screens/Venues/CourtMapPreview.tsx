/**
 * CourtMapPreview — compact static map card shown on the Court Detail screen.
 *
 * Renders a non-scrolling MapView (lite mode) with a single Marker when the
 * court has valid latitude/longitude. Tapping the preview opens native Maps
 * with directions to the court via `openDirections`.
 *
 * Falls back gracefully when coordinates are unavailable, showing the court
 * address (or a "Map unavailable" label) in a neutral placeholder.
 *
 * The court address line is always shown below the map (or placeholder).
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import MapView from 'react-native-maps';
import { openDirections } from '@/utils/maps';
import CourtMarker from './CourtMarker';
import { singlePinRegion, type CourtWithCoords } from '@/utils/mapRegion';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the embedded map card in dp. */
const MAP_HEIGHT = 160;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MapPlaceholderProps {
  readonly address: string | null | undefined;
}

/**
 * Neutral placeholder shown when the court has no coordinates.
 */
function MapPlaceholder({ address }: MapPlaceholderProps): React.ReactNode {
  return (
    <View
      className="items-center justify-center bg-surface border border-strong rounded-xl"
      style={{ height: MAP_HEIGHT }}
    >
      <Text className="text-[13px] text-muted">Map unavailable</Text>
      {address != null && address.length > 0 && (
        <Text className="text-[12px] text-tertiary mt-1">{address}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CourtMapPreviewProps {
  readonly court: Court;
}

/**
 * CourtMapPreview renders a small pressable map at the bottom of the Court
 * Detail screen. Pressing it launches the native maps app for directions.
 */
export default function CourtMapPreview({
  court,
}: CourtMapPreviewProps): React.ReactNode {
  const hasCoords =
    court.latitude != null && court.longitude != null;

  const handlePress = useCallback(async () => {
    if (!hasCoords) return;
    await openDirections({
      latitude: court.latitude as number,
      longitude: court.longitude as number,
      name: court.name,
    });
  }, [hasCoords, court.latitude, court.longitude, court.name]);

  const accessibilityLabel =
    court.address != null
      ? `Open directions to ${court.name} at ${court.address}`
      : `Open directions to ${court.name}`;

  return (
    <View testID="court-map-preview" className="px-4 pb-4">
      {/* Section header */}
      <Text className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">
        Location
      </Text>

      {/* Map card or placeholder */}
      {hasCoords ? (
        <Pressable
          onPress={() => { void handlePress(); }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          className="rounded-xl overflow-hidden border border-strong active:opacity-80"
          style={{ height: MAP_HEIGHT }}
        >
          <MapView
            style={{ flex: 1 }}
            /**
             * `liteMode` on Android renders a static map image (no gesture
             * handling) which is ideal for a preview card. The prop is
             * Android-only; on iOS it has no effect but is safe to pass.
             */
            liteMode={Platform.OS === 'android'}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
            initialRegion={singlePinRegion({
              latitude: court.latitude as number,
              longitude: court.longitude as number,
            })}
          >
            <CourtMarker court={court as CourtWithCoords} />
          </MapView>
        </Pressable>
      ) : (
        <MapPlaceholder address={court.address} />
      )}

      {/* Address line (shown below the map card when coords are present) */}
      {hasCoords && court.address != null && court.address.length > 0 && (
        <Text className="text-[13px] text-muted mt-2">{court.address}</Text>
      )}

      {/* Directions hint */}
      {hasCoords && (
        <Text className="text-[11px] text-tertiary mt-1">
          Tap map to open directions
        </Text>
      )}
    </View>
  );
}
