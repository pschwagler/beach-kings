'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMap, { Marker, NavigationControl, type MapMouseEvent, type MapRef } from 'react-map-gl/mapbox';
import { MapPin } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import './CourtPinCorrectionMap.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export interface CourtCoordinates {
  latitude: number;
  longitude: number;
}

interface CourtPinCorrectionMapProps {
  current: CourtCoordinates;
  proposed: CourtCoordinates;
  onChange?: (coordinates: CourtCoordinates) => void;
  compact?: boolean;
}

export default function CourtPinCorrectionMap({ current, proposed, onChange, compact = false }: CourtPinCorrectionMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [providerError, setProviderError] = useState(false);
  const canEdit = Boolean(onChange);
  const framing = useMemo(() => {
    let proposedLongitude = proposed.longitude;
    const longitudeDelta = proposedLongitude - current.longitude;
    if (longitudeDelta > 180) proposedLongitude -= 360;
    if (longitudeDelta < -180) proposedLongitude += 360;
    const midpointLongitude = (current.longitude + proposedLongitude) / 2;
    return {
      bounds: [
        [Math.min(current.longitude, proposedLongitude), Math.min(current.latitude, proposed.latitude)],
        [Math.max(current.longitude, proposedLongitude), Math.max(current.latitude, proposed.latitude)],
      ] as [[number, number], [number, number]],
      midpoint: {
        latitude: (current.latitude + proposed.latitude) / 2,
        longitude: ((midpointLongitude + 540) % 360) - 180,
      },
    };
  }, [current, proposed]);

  const fitPins = useCallback(() => {
    mapRef.current?.fitBounds(framing.bounds, {
      padding: compact ? 42 : 56,
      maxZoom: compact ? 15 : 16,
      duration: 0,
    });
  }, [compact, framing.bounds]);

  useEffect(() => {
    fitPins();
  }, [fitPins]);

  if (!MAPBOX_TOKEN || providerError) {
    return (
      <div className="court-pin-map court-pin-map--fallback" role="status">
        <MapPin size={18} />
        <span>Map preview unavailable. Pin placement cannot be reviewed right now.</span>
      </div>
    );
  }

  const placePin = (event: MapMouseEvent) => {
    if (!onChange) return;
    onChange({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
  };

  return (
    <div className={`court-pin-map${compact ? ' court-pin-map--compact' : ''}`} role="group" aria-label={canEdit ? 'Court pin placement map' : 'Current and proposed court pins map'}>
      <ReactMap
        ref={mapRef}
        initialViewState={{ ...framing.midpoint, zoom: current.latitude === proposed.latitude && current.longitude === proposed.longitude ? 16 : 13 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={placePin}
        onLoad={fitPins}
        onError={() => setProviderError(true)}
        cursor={canEdit ? 'crosshair' : 'grab'}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Marker latitude={current.latitude} longitude={current.longitude} anchor="bottom">
          <span className="court-pin-map__marker court-pin-map__marker--current" role="img" aria-label="Current court pin"><MapPin aria-hidden="true" size={28} /></span>
        </Marker>
        <Marker
          latitude={proposed.latitude}
          longitude={proposed.longitude}
          anchor="bottom"
          draggable={canEdit}
          onDragEnd={(event) => onChange?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })}
        >
          <span className="court-pin-map__marker court-pin-map__marker--proposed" role="img" aria-label="Proposed court pin"><MapPin aria-hidden="true" size={30} /></span>
        </Marker>
      </ReactMap>
      <div className="court-pin-map__legend">
        <span><i className="court-pin-map__key court-pin-map__key--current" /> Current</span>
        <span><i className="court-pin-map__key court-pin-map__key--proposed" /> Proposed</span>
      </div>
    </div>
  );
}
