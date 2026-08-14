/**
 * CourtsMap — shared courts map surface with visible-region clustering.
 *
 * Display-only: it owns no data fetching. Coordinates and selection are passed
 * in by the parent.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Platform, type StyleProp, type ViewStyle } from 'react-native';
import MapView from 'react-native-maps';
import type Supercluster from 'supercluster';
import CourtMarker from './CourtMarker';
import CourtClusterMarker from './CourtClusterMarker';
import AppText from '@/components/ui/AppText';
import { computeRegion, courtsWithCoords, type LatLng, type Region } from '@/utils/mapRegion';
import {
  clustersForRegion,
  createCourtClusterIndex,
  isCourtPoint,
  regionForCluster,
} from '@/features/courts/clustering';
import type { Court } from '@beach-kings/shared';

export interface CourtsMapProps {
  /** Courts list; only those with latitude + longitude are pinned. */
  readonly courts: readonly Court[];
  /** Optional current-user location used to center the map and show the dot. */
  readonly userLocation?: LatLng | null;
  /** Parent-owned framing. Changes intentionally recenter the map. */
  readonly preferredRegion?: Region;
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
  preferredRegion,
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
    () => preferredRegion ?? computeRegion(pinnedCoords, userLocation),
    [preferredRegion, pinnedCoords, userLocation],
  );
  const mapRef = useRef<MapView>(null);
  const [visibleRegion, setVisibleRegion] = useState(region);
  useEffect(() => {
    setVisibleRegion(region);
  }, [region]);
  const clusterIndex = useMemo(
    () => createCourtClusterIndex(pinnedCourts),
    [pinnedCourts],
  );
  const visibleFeatures = useMemo(
    () => clustersForRegion(clusterIndex, visibleRegion),
    [clusterIndex, visibleRegion],
  );

  const handleClusterPress = useCallback(
    (clusterId: number) => {
      const cluster = visibleFeatures.find(
        (feature): feature is Supercluster.ClusterFeature<Supercluster.AnyProps> =>
          !isCourtPoint(feature) &&
          feature.properties.cluster_id === clusterId,
      );
      if (cluster == null) return;

      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      const expandedRegion = regionForCluster(
        cluster.geometry.coordinates as [number, number],
        expansionZoom,
      );
      setVisibleRegion(expandedRegion);
      mapRef.current?.animateToRegion(expandedRegion, 250);
    },
    [clusterIndex, visibleFeatures],
  );

  if (pinnedCourts.length === 0 && userLocation == null) {
    return (
      <View testID={testID} className="flex-1 items-center justify-center bg-surface" style={style}>
        <AppText className="text-[14px] text-muted">{emptyLabel}</AppText>
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
        ref={mapRef}
        style={{ flex: 1 }}
        region={visibleRegion}
        onRegionChangeComplete={setVisibleRegion}
        showsUserLocation={userLocation != null}
        {...staticProps}
      >
        {visibleFeatures.map((feature) => {
          if (isCourtPoint(feature)) {
            const court = feature.properties.court;
            return (
              <CourtMarker
                key={`court-${court.id}`}
                court={court}
                onPress={onSelectCourt}
              />
            );
          }

          const clusterId = feature.properties.cluster_id;
          const [longitude, latitude] = feature.geometry.coordinates;
          return (
            <CourtClusterMarker
              key={`cluster-${clusterId}`}
              id={clusterId}
              coordinate={{ latitude, longitude }}
              count={feature.properties.point_count}
              onPress={handleClusterPress}
            />
          );
        })}
      </MapView>
    </View>
  );
}
