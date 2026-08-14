import React from 'react';
import { Marker } from 'react-native-maps';
import { View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface CourtClusterMarkerProps {
  readonly id: number;
  readonly coordinate: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly count: number;
  readonly onPress: (id: number) => void;
}

export default function CourtClusterMarker({
  id,
  coordinate,
  count,
  onPress,
}: CourtClusterMarkerProps): React.ReactNode {
  const palette = usePaletteColors();
  const label = `${count} courts`;

  return (
    <Marker
      testID={`court-cluster-${id}`}
      coordinate={coordinate}
      onPress={() => onPress(id)}
      accessibilityLabel={label}
      accessibilityHint="Zooms in to show courts in this area"
      accessibilityRole="button"
      tracksViewChanges={false}
    >
      <View
        className="min-h-touch min-w-touch rounded-full border-2 border-surface items-center justify-center px-2"
        style={{ backgroundColor: palette.brandTeal }}
      >
        <AppText
          className="text-xs font-bold"
          style={{ color: palette.onBrandTeal }}
        >
          {count > 99 ? '99+' : count}
        </AppText>
      </View>
    </Marker>
  );
}
