'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMap, { Marker, NavigationControl, Popup, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/mapbox';
import { Layers3, LocateFixed, MapPin } from 'lucide-react';
import StarRating from '../ui/StarRating';
import type { Court } from '../../types';
import 'mapbox-gl/dist/mapbox-gl.css';
import './CourtMap.css';
import {
  normalizeMapBounds,
  toMapboxBounds,
  type MapBounds,
} from '../../utils/mapBounds';

export type { MapBounds } from '../../utils/mapBounds';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const NYC_VIEW = { latitude: 40.7128, longitude: -74.006, zoom: 10 };
const MAP_STYLES = [
  { label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { label: 'Terrain', url: 'mapbox://styles/mapbox/outdoors-v12' },
];

interface Props {
  courts: Court[];
  selectedCourt: Court | null;
  highlightedCourt?: Court | null;
  committedBounds: MapBounds;
  userLocation?: { latitude: number; longitude: number };
  onSelectCourt: (court: Court | null) => void;
  onHighlightCourt: (court: Court | null) => void;
  onBoundsChange: (bounds: MapBounds) => void;
}

interface Cluster { id: string; latitude: number; longitude: number; courts: Array<Court & { latitude: number; longitude: number }> }

export default function CourtMap({ courts, selectedCourt, highlightedCourt, committedBounds, userLocation, onSelectCourt, onHighlightCourt, onBoundsChange }: Props) {
  const mapRef = useRef<MapRef>(null);
  const programmaticMove = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [providerError, setProviderError] = useState(false);
  const [zoom, setZoom] = useState(NYC_VIEW.zoom);
  const [mapStyle, setMapStyle] = useState(MAP_STYLES[0].url);
  const [styleOpen, setStyleOpen] = useState(false);
  const mappable = useMemo(() => courts.filter((court): court is Court & { latitude: number; longitude: number } => court.latitude != null && court.longitude != null), [courts]);

  const clusters = useMemo(() => {
    const cellSize = Math.max(0.002, 40 / (2 ** zoom));
    const groups = new Map<string, Array<Court & { latitude: number; longitude: number }>>();
    mappable.forEach((court) => {
      const key = `${Math.floor(court.latitude / cellSize)}:${Math.floor(court.longitude / cellSize)}`;
      groups.set(key, [...(groups.get(key) || []), court]);
    });
    return [...groups.entries()].map(([id, items]): Cluster => ({
      id,
      courts: items,
      latitude: items.reduce((sum, item) => sum + item.latitude, 0) / items.length,
      longitude: items.reduce((sum, item) => sum + item.longitude, 0) / items.length,
    }));
  }, [mappable, zoom]);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    programmaticMove.current = true;
    mapRef.current.fitBounds(
      toMapboxBounds(committedBounds),
      { padding: 56, duration: 500, maxZoom: 14 },
    );
  }, [committedBounds, loaded]);

  const reportBounds = useCallback((event: ViewStateChangeEvent) => {
    setZoom(event.viewState.zoom);
    if (programmaticMove.current) { programmaticMove.current = false; return; }
    const bounds = event.target.getBounds();
    if (!bounds) return;
    onBoundsChange(normalizeMapBounds({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }));
  }, [onBoundsChange]);

  if (!MAPBOX_TOKEN || providerError) {
    return <div className="court-map court-map--error" role="alert"><Layers3 size={26} /><strong>Map unavailable</strong><span>{!MAPBOX_TOKEN ? 'Map configuration is missing.' : 'The map provider could not load.'}</span></div>;
  }

  return (
    <div className="court-map">
      {!loaded && <div className="court-map__skeleton" role="status" aria-label="Loading map"><span /></div>}
      <ReactMap
        ref={mapRef}
        initialViewState={{ ...NYC_VIEW, latitude: userLocation?.latitude ?? NYC_VIEW.latitude, longitude: userLocation?.longitude ?? NYC_VIEW.longitude }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={() => setLoaded(true)}
        onError={() => setProviderError(true)}
        onMoveEnd={reportBounds}
        onClick={() => onSelectCourt(null)}
        reuseMaps
      >
        <NavigationControl position="top-right" />
        {clusters.map((cluster) => cluster.courts.length > 1 ? (
          <Marker key={cluster.id} latitude={cluster.latitude} longitude={cluster.longitude} anchor="center">
            <button type="button" className="court-map__cluster" aria-label={`Zoom to ${cluster.courts.length} courts`} onClick={(event) => { event.stopPropagation(); mapRef.current?.flyTo({ center: [cluster.longitude, cluster.latitude], zoom: zoom + 2, duration: 400 }); }}>
              {cluster.courts.length}
            </button>
          </Marker>
        ) : (
          <Marker key={cluster.courts[0].id} latitude={cluster.latitude} longitude={cluster.longitude} anchor="bottom">
            <button
              type="button"
              className={`court-map__pin${selectedCourt?.id === cluster.courts[0].id ? ' court-map__pin--selected' : ''}${highlightedCourt?.id === cluster.courts[0].id ? ' court-map__pin--highlighted' : ''}`}
              aria-label={`Select ${cluster.courts[0].name}`}
              onMouseEnter={() => onHighlightCourt(cluster.courts[0])}
              onMouseLeave={() => onHighlightCourt(null)}
              onFocus={() => onHighlightCourt(cluster.courts[0])}
              onBlur={() => onHighlightCourt(null)}
              onClick={(event) => { event.stopPropagation(); onSelectCourt(cluster.courts[0]); }}
            ><MapPin size={28} /></button>
          </Marker>
        ))}
        {userLocation && <Marker latitude={userLocation.latitude} longitude={userLocation.longitude} anchor="center"><span className="court-map__user-dot" aria-label="Your location" /></Marker>}
        {(selectedCourt || highlightedCourt)?.latitude != null && (selectedCourt || highlightedCourt)?.longitude != null && (() => {
          const preview = (selectedCourt || highlightedCourt)!;
          return <Popup latitude={preview.latitude!} longitude={preview.longitude!} anchor="bottom" offset={34} closeOnClick={false} closeButton={Boolean(selectedCourt)} onClose={() => selectedCourt ? onSelectCourt(null) : onHighlightCourt(null)} className="court-map__popup">
            <h3>{preview.name}</h3>
            <div className="court-map__popup-rating">{(preview.review_count || 0) > 0 ? <><StarRating value={preview.average_rating || 0} size={12} /><span>({preview.review_count})</span></> : <span>New court</span>}</div>
            {preview.address && <p>{preview.address}</p>}
            {selectedCourt && <a href={`/courts/${preview.slug}`}>View court details</a>}
          </Popup>
        })()}
      </ReactMap>

      <div className="court-map__style-control">
        <button type="button" aria-expanded={styleOpen} onClick={() => setStyleOpen((value) => !value)}><Layers3 size={16} /> Map style</button>
        {styleOpen && <div role="menu">{MAP_STYLES.map((style) => <button role="menuitemradio" aria-checked={mapStyle === style.url} key={style.url} type="button" onClick={() => { setMapStyle(style.url); setStyleOpen(false); }}>{style.label}</button>)}</div>}
      </div>
      <button type="button" className="court-map__locate-btn" aria-label="Center on my location" disabled={!userLocation} onClick={() => userLocation && mapRef.current?.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 12, duration: 450 })}><LocateFixed size={18} /></button>
    </div>
  );
}
