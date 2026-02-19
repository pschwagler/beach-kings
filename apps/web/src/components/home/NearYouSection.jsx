'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MapPin, Users, BarChart3 } from 'lucide-react';
import { getPublicCourts, getPublicPlayers, getPublicLocations } from '../../services/api';
import { useUserPosition } from '../../hooks/useUserPosition';
import { PLAYER_LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import { isImageUrl } from '../../utils/avatar';
import { Button } from '../ui/UI';
import StarRating from '../ui/StarRating';
import LevelBadge from '../ui/LevelBadge';
import './NearYouSection.css';

/**
 * "Near You" discovery section for the home page.
 * Shows courts, top players, and location stats based on the user's location_id.
 *
 * @param {Object} props
 * @param {Object} props.currentUserPlayer - Player profile with location_id, location_slug, city, state
 * @param {function} props.onTabChange - Callback to switch home tabs (e.g., 'profile')
 */
export default function NearYouSection({ currentUserPlayer, onTabChange }) {
  const locationId = currentUserPlayer?.location_id;
  const locationSlug = currentUserPlayer?.location_slug;
  const cityName = currentUserPlayer?.city || 'Your Area';

  const profileCoords = currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
    ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
    : null;
  const { position: userPos, source: posSource } = useUserPosition(profileCoords);

  const [courts, setCourts] = useState([]);
  const [players, setPlayers] = useState([]);
  const [locationData, setLocationData] = useState(null);
  const [levelFilter, setLevelFilter] = useState('');
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Fetch courts — geolocation = proximity only, profile = filter by location_id
  useEffect(() => {
    if (!locationId && !userPos) return;

    const courtParams = { page_size: 4 };
    if (posSource === 'geolocation' && userPos) {
      // User is somewhere specific — show courts near their actual position
      courtParams.user_lat = userPos.latitude;
      courtParams.user_lng = userPos.longitude;
    } else if (locationId) {
      // Fall back to profile's location hub
      courtParams.location_id = locationId;
      if (userPos) {
        courtParams.user_lat = userPos.latitude;
        courtParams.user_lng = userPos.longitude;
      }
    }
    getPublicCourts(courtParams)
      .then((data) => setCourts(data.items || []))
      .catch(() => {});
  }, [locationId, userPos, posSource]);

  // Fetch location data for stats widget (always based on profile location)
  useEffect(() => {
    if (!locationId) return;
    getPublicLocations()
      .then((data) => {
        const allLocations = (data.regions || []).flatMap((r) => r.locations || []);
        const match = allLocations.find((loc) => loc.id === locationId);
        if (match) setLocationData(match);
      })
      .catch(() => {});
  }, [locationId]);

  // Fetch players (re-runs on level filter change)
  const fetchPlayers = useCallback(async () => {
    if (!locationId) return;
    setLoadingPlayers(true);
    try {
      const params = {
        location_id: locationId,
        sort_by: 'rating',
        sort_dir: 'desc',
        page_size: 10,
      };
      if (levelFilter) params.level = levelFilter;
      const data = await getPublicPlayers(params);
      setPlayers(data.items || data.players || []);
    } catch {
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  }, [locationId, levelFilter]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // No location and no geolocation — show prompt
  if (!locationId && !userPos) {
    return (
      <section className="near-you-section">
        <h2 className="near-you-section__title">Near You</h2>
        <div className="near-you-section__prompt">
          <p>Set your location to discover courts, players, and leagues near you.</p>
          <Button variant="default" onClick={() => onTabChange('profile')}>
            Set Your Location
          </Button>
        </div>
      </section>
    );
  }

  const locationHref = locationSlug ? `/beach-volleyball/${locationSlug}` : null;

  return (
    <section className="near-you-section">
      <h2 className="near-you-section__title">Near You</h2>

      <div className="near-you-section__grid">
        {/* Courts widget */}
        <div className="near-you-section__widget">
          <div className="near-you-section__widget-header">
            <MapPin size={16} />
            <h3 className="near-you-section__widget-title">Courts Near You</h3>
          </div>
          <div className="near-you-section__widget-body">
            {courts.length === 0 ? (
              <div className="near-you-section__empty">No courts found nearby</div>
            ) : (
              courts.map((court) => (
                <Link
                  key={court.id}
                  href={`/courts/${court.slug}`}
                  className="near-you-section__court-item"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="near-you-section__court-info">
                    <div className="near-you-section__court-name">{court.name}</div>
                    {court.address && (
                      <div className="near-you-section__court-address">{court.address}</div>
                    )}
                  </div>
                  {court.avg_rating > 0 && (
                    <StarRating value={court.avg_rating} size={14} />
                  )}
                </Link>
              ))
            )}
          </div>
          <Link
            href={posSource === 'geolocation' || !locationId ? '/courts' : `/courts?location=${locationId}`}
            className="near-you-section__view-all"
          >
            View all courts &rarr;
          </Link>
        </div>

        {/* Top Players widget — requires a location hub */}
        {locationId && <div className="near-you-section__widget">
          <div className="near-you-section__widget-header">
            <Users size={16} />
            <h3 className="near-you-section__widget-title">Top Players in {cityName}</h3>
          </div>
          <div className="near-you-section__level-tabs">
            {PLAYER_LEVEL_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`near-you-section__level-tab${levelFilter === opt.value ? ' near-you-section__level-tab--active' : ''}`}
                onClick={() => setLevelFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="near-you-section__widget-body">
            {loadingPlayers ? (
              <div className="near-you-section__empty">Loading...</div>
            ) : players.length === 0 ? (
              <div className="near-you-section__empty">No players found</div>
            ) : (
              players.map((player) => (
                <Link
                  key={player.id}
                  href={`/player/${player.id}`}
                  className="near-you-section__player-item"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="near-you-section__player-avatar">
                    {isImageUrl(player.avatar || player.profile_picture_url) ? (
                      <img
                        src={player.avatar || player.profile_picture_url}
                        alt={player.full_name}
                      />
                    ) : (
                      (player.full_name || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="near-you-section__player-info">
                    <span className="near-you-section__player-name">{player.full_name}</span>
                    {player.level && <LevelBadge level={player.level} />}
                  </div>
                  <span className="near-you-section__player-rating">
                    {Math.round(player.stats?.current_rating || player.current_rating || 1200)}
                  </span>
                </Link>
              ))
            )}
          </div>
          {locationHref && (
            <Link href={locationHref} className="near-you-section__view-all">
              View all players &rarr;
            </Link>
          )}
        </div>}

        {/* Location stats widget */}
        {locationData && (
          <div className="near-you-section__widget" style={{ gridColumn: '1 / -1' }}>
            <div className="near-you-section__widget-header">
              <BarChart3 size={16} />
              <h3 className="near-you-section__widget-title">
                {locationData.name || cityName}
              </h3>
            </div>
            <div className="near-you-section__widget-body">
              <div className="near-you-section__stats-row">
                <div className="near-you-section__stat">
                  <div className="near-you-section__stat-value">{locationData.league_count || 0}</div>
                  <div className="near-you-section__stat-label">Leagues</div>
                </div>
                <div className="near-you-section__stat">
                  <div className="near-you-section__stat-value">{locationData.player_count || 0}</div>
                  <div className="near-you-section__stat-label">Players</div>
                </div>
                <div className="near-you-section__stat">
                  <div className="near-you-section__stat-value">{locationData.court_count || 0}</div>
                  <div className="near-you-section__stat-label">Courts</div>
                </div>
              </div>
            </div>
            {locationHref && (
              <Link href={locationHref} className="near-you-section__view-all">
                Explore {locationData.name || cityName} &rarr;
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
