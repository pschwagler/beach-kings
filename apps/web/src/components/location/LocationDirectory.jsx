'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { Button } from '../ui/UI';
import './LocationDirectory.css';

/**
 * Location directory page for SEO and unauthenticated visitors.
 * Shows all locations grouped by region with league/player/court counts.
 * Includes client-side search filter by city or location name.
 *
 * @param {Object} props
 * @param {Array} props.regions - Regions with nested locations from the API
 * @param {boolean} props.isAuthenticated - Whether the current user is logged in
 */
export default function LocationDirectory({ regions, isAuthenticated }) {
  const { openAuthModal } = useAuthModal();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignIn = () => openAuthModal('sign-in');
  const handleSignUp = () => openAuthModal('sign-up');

  const totalLocations = regions.reduce((sum, r) => sum + r.locations.length, 0);

  /** Filter regions/locations by search term (city or name, case-insensitive). */
  const filteredRegions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return regions;
    return regions
      .map((region) => ({
        ...region,
        locations: region.locations.filter(
          (loc) =>
            loc.city?.toLowerCase().includes(q) ||
            loc.name?.toLowerCase().includes(q) ||
            loc.state?.toLowerCase().includes(q)
        ),
      }))
      .filter((region) => region.locations.length > 0);
  }, [regions, searchQuery]);

  const filteredTotal = filteredRegions.reduce((sum, r) => sum + r.locations.length, 0);

  return (
    <div className="location-directory">
      {/* Header */}
      <div className="location-directory__header">
        <h1 className="location-directory__title">Beach Volleyball Locations</h1>
        <p className="location-directory__subtitle">
          Find leagues, players, and courts near you
        </p>
      </div>

      {/* Auth prompt for unauthenticated users */}
      {!isAuthenticated && (
        <div className="location-directory__auth-prompt">
          <span className="location-directory__auth-prompt-text">
            <button className="location-directory__auth-prompt-link" onClick={handleSignIn} aria-label="Log in to Beach League">Log in</button>
            {' or '}
            <button className="location-directory__auth-prompt-link" onClick={handleSignUp} aria-label="Sign up for Beach League">sign up</button>
            {' to join leagues and track your stats'}
          </span>
        </div>
      )}

      {/* Search filter */}
      {totalLocations > 0 && (
        <div className="location-directory__search">
          <Search size={16} className="location-directory__search-icon" />
          <input
            type="text"
            placeholder="Search by city or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="location-directory__search-input"
          />
        </div>
      )}

      {/* Region groups */}
      {filteredTotal === 0 ? (
        <div className="location-directory__empty">
          {totalLocations === 0 ? (
            <>
              <h2>No locations yet</h2>
              <p>Check back soon as we expand to new areas.</p>
            </>
          ) : (
            <>
              <h2>No matching locations</h2>
              <p>Try a different search term.</p>
            </>
          )}
        </div>
      ) : (
        filteredRegions.map((region) => (
          <section key={region.id ?? 'other'} className="location-directory__region">
            <h2 className="location-directory__region-title">{region.name}</h2>
            <div className="location-directory__locations">
              {region.locations.map((loc) => (
                <Link
                  key={loc.id}
                  href={`/beach-volleyball/${loc.slug}`}
                  className="location-directory__card"
                >
                  <div className="location-directory__card-info">
                    <span className="location-directory__card-name">
                      {loc.city}, {loc.state}
                    </span>
                    <span className="location-directory__card-stats">
                      {loc.league_count} league{loc.league_count !== 1 ? 's' : ''}
                      {' \u00B7 '}
                      {loc.player_count} player{loc.player_count !== 1 ? 's' : ''}
                      {loc.court_count > 0 && (
                        <>
                          {' \u00B7 '}
                          {loc.court_count} court{loc.court_count !== 1 ? 's' : ''}
                        </>
                      )}
                    </span>
                  </div>
                  <span className="location-directory__card-arrow">&rsaquo;</span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Footer CTA */}
      {!isAuthenticated && totalLocations > 0 && (
        <div className="location-directory__footer">
          <p>Join the beach volleyball community</p>
          <div className="location-directory__cta-buttons">
            <Button onClick={handleSignIn}>Log In</Button>
            <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
          </div>
        </div>
      )}
    </div>
  );
}
