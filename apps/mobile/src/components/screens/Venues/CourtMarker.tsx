/**
 * CourtMarker — a single map pin for a court, in the brand color.
 *
 * Shared across the full-screen courts map, the list preview, and the
 * court-detail card so the pin styling and callout stay consistent.
 */

import React from 'react';
import { Marker } from 'react-native-maps';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { CourtWithCoords } from '@/utils/mapRegion';

export interface CourtMarkerProps {
  /** Court with guaranteed coordinates (filter with `courtsWithCoords` first). */
  readonly court: CourtWithCoords;
  /** Called when the pin or its callout is tapped. Omit for a static pin. */
  readonly onPress?: (court: CourtWithCoords) => void;
}

/** Builds the marker subtitle from city/state, falling back to the address. */
function describeCourt(court: CourtWithCoords): string | undefined {
  const cityState = [court.city, court.state].filter(Boolean).join(', ');
  return cityState || court.address || undefined;
}

export default function CourtMarker({ court, onPress }: CourtMarkerProps): React.ReactNode {
  const palette = usePaletteColors();
  const handlePress = onPress ? () => onPress(court) : undefined;

  return (
    <Marker
      testID={`court-marker-${court.id}`}
      coordinate={{ latitude: court.latitude, longitude: court.longitude }}
      title={court.name}
      description={describeCourt(court)}
      pinColor={palette.brandTeal}
      onPress={handlePress}
      onCalloutPress={handlePress}
      accessibilityLabel={court.name}
      accessibilityHint="Opens court details"
      accessibilityRole="button"
    />
  );
}
