'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import { MapPin, LocateFixed } from 'lucide-react';
import StarRating from '../ui/StarRating';
import 'mapbox-gl/dist/mapbox-gl.css';
import './CourtMap.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Fallback center — continental US */
const DEFAULT_VIEW = { latitude: 39.5, longitude: -98.35, zoom: 4 };

const MAP_STYLES = [
  { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'outdoors', label: 'Terrain', url: 'mapbox://styles/mapbox/outdoors-v12' },
];

/** Number of nearest courts to auto-fit the initial viewport around. */
const AUTO_FIT_COUNT = 10;

/**
 * Haversine distance in miles between two lat/lng points.
 */
function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Interactive Mapbox map displaying court pins.
 *
 * Centers on the user's location (browser geolocation → player profile → default).
 * Clicking a pin shows a popup with court info and a link to the detail page.
 *
 * @param {Object} props
 * @param {Array} props.courts - Court list items with latitude/longitude
 * @param {Object} [props.userLocation] - { latitude, longitude } from player profile
 */
export default function CourtMap({ courts, userLocation }) {
  const [popupCourt, setPopupCourt] = useState(null);
  const [userPos, setUserPos] = useState(userLocation || null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState(MAP_STYLES[0].url);
  const mapRef = useRef(null);
  const geoAttempted = useRef(false);
  const hasFittedWithGeo = useRef(false);

  // Request browser geolocation once — map renders immediately, adjusts when resolved
  useEffect(() => {
    if (geoAttempted.current) return;
    geoAttempted.current = true;

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {}, // failed — use profile location or default
      { timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // Filter to only courts with coordinates
  const mappable = useMemo(
    () => courts.filter((c) => c.latitude != null && c.longitude != null),
    [courts]
  );

  // Fit map bounds to nearest courts once map is loaded + we have position/courts
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mappable.length === 0) return;

    if (userPos) {
      // Sort by distance, take nearest N, fit bounds around them + user
      const withDist = mappable.map((c) => ({
        ...c,
        _dist: distanceMiles(userPos.latitude, userPos.longitude, c.latitude, c.longitude),
      }));
      withDist.sort((a, b) => a._dist - b._dist);
      const nearest = withDist.slice(0, AUTO_FIT_COUNT);

      const lngs = [userPos.longitude, ...nearest.map((c) => c.longitude)];
      const lats = [userPos.latitude, ...nearest.map((c) => c.latitude)];
      const sw = [Math.min(...lngs), Math.min(...lats)];
      const ne = [Math.max(...lngs), Math.max(...lats)];
      // Animate when geolocation resolved after initial render, instant otherwise
      const animate = hasFittedWithGeo.current === false && userLocation == null;
      mapRef.current.fitBounds([sw, ne], { padding: 60, maxZoom: 14, duration: animate ? 800 : 0 });
      hasFittedWithGeo.current = true;
    } else if (mappable.length > 1) {
      const lngs = mappable.map((c) => c.longitude);
      const lats = mappable.map((c) => c.latitude);
      const sw = [Math.min(...lngs), Math.min(...lats)];
      const ne = [Math.max(...lngs), Math.max(...lats)];
      mapRef.current.fitBounds([sw, ne], { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [mappable, userPos, mapLoaded, userLocation]);

  const handleLocateClick = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserPos(newPos);
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [newPos.longitude, newPos.latitude],
            zoom: 11,
            duration: 800,
          });
        }
      },
      () => {},
      { timeout: 5000, maximumAge: 0 }
    );
  }, []);

  const handleMarkerClick = useCallback((court) => {
    setPopupCourt(court);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="court-map court-map--no-token">
        <p>Map unavailable — Mapbox token not configured.</p>
      </div>
    );
  }

  const initialView = userPos
    ? { latitude: userPos.latitude, longitude: userPos.longitude, zoom: 10 }
    : mappable.length === 1
      ? { latitude: mappable[0].latitude, longitude: mappable[0].longitude, zoom: 13 }
      : DEFAULT_VIEW;

  return (
    <div className="court-map">
      <Map
        ref={mapRef}
        initialViewState={initialView}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={() => setMapLoaded(true)}
        reuseMaps
      >
        <NavigationControl position="top-right" />

        {mappable.map((court) => (
          <Marker
            key={court.id}
            latitude={court.latitude}
            longitude={court.longitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleMarkerClick(court);
            }}
          >
            <div
              className={`court-map__pin${popupCourt?.id === court.id ? ' court-map__pin--active' : ''}`}
              title={court.name}
            >
              <MapPin size={24} />
            </div>
          </Marker>
        ))}

        {/* User location dot */}
        {userPos && (
          <Marker latitude={userPos.latitude} longitude={userPos.longitude} anchor="center">
            <div className="court-map__user-dot" title="Your location" />
          </Marker>
        )}

        {popupCourt && (
          <Popup
            latitude={popupCourt.latitude}
            longitude={popupCourt.longitude}
            anchor="bottom"
            offset={30}
            closeOnClick={false}
            onClose={() => setPopupCourt(null)}
            className="court-map__popup"
          >
            <a href={`/courts/${popupCourt.slug}`} className="court-map__popup-link">
              <h4 className="court-map__popup-name">{popupCourt.name}</h4>
              <div className="court-map__popup-rating">
                {popupCourt.review_count > 0 ? (
                  <>
                    <StarRating value={popupCourt.average_rating || 0} size={12} />
                    <span>({popupCourt.review_count})</span>
                  </>
                ) : (
                  <span className="court-map__popup-new">New</span>
                )}
              </div>
              {popupCourt.address && (
                <p className="court-map__popup-address">{popupCourt.address}</p>
              )}
              {userPos && popupCourt.latitude && popupCourt.longitude && (
                <p className="court-map__popup-distance">
                  {distanceMiles(userPos.latitude, userPos.longitude, popupCourt.latitude, popupCourt.longitude).toFixed(1)} mi away
                </p>
              )}
            </a>
          </Popup>
        )}
      </Map>

      {/* Map style toggle */}
      <div className="court-map__style-toggle">
        {MAP_STYLES.map((s) => (
          <button
            key={s.id}
            className={`court-map__style-btn${mapStyle === s.url ? ' court-map__style-btn--active' : ''}`}
            onClick={() => setMapStyle(s.url)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Locate me button */}
      <button
        className="court-map__locate-btn"
        onClick={handleLocateClick}
        title="Center on my location"
        aria-label="Center on my location"
      >
        <LocateFixed size={18} />
      </button>
    </div>
  );
}
