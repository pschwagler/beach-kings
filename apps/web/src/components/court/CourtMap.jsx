'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import { MapPin } from 'lucide-react';
import StarRating from '../ui/StarRating';
import 'mapbox-gl/dist/mapbox-gl.css';
import './CourtMap.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Default center — NYC */
const DEFAULT_VIEW = { latitude: 40.73, longitude: -73.99, zoom: 11 };

/**
 * Interactive Mapbox map displaying court pins.
 *
 * Clicking a pin shows a popup with court info and a link to the detail page.
 *
 * @param {Object} props
 * @param {Array} props.courts - Court list items with latitude/longitude
 */
export default function CourtMap({ courts }) {
  const [popupCourt, setPopupCourt] = useState(null);
  const mapRef = useRef(null);

  // Filter to only courts with coordinates
  const mappable = useMemo(
    () => courts.filter((c) => c.latitude != null && c.longitude != null),
    [courts]
  );

  // Fit map bounds to all courts on mount / court list change
  useEffect(() => {
    if (!mapRef.current || mappable.length === 0) return;
    if (mappable.length === 1) return; // single point uses default zoom

    const lngs = mappable.map((c) => c.longitude);
    const lats = mappable.map((c) => c.latitude);
    const sw = [Math.min(...lngs), Math.min(...lats)];
    const ne = [Math.max(...lngs), Math.max(...lats)];

    mapRef.current.fitBounds([sw, ne], { padding: 60, maxZoom: 14, duration: 0 });
  }, [mappable]);

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

  const initialView = mappable.length === 1
    ? { latitude: mappable[0].latitude, longitude: mappable[0].longitude, zoom: 13 }
    : DEFAULT_VIEW;

  return (
    <div className="court-map">
      <Map
        ref={mapRef}
        initialViewState={initialView}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
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
            </a>
          </Popup>
        )}
      </Map>
    </div>
  );
}
