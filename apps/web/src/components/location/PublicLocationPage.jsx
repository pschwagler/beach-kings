'use client';

import Link from 'next/link';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { Button } from '../ui/UI';
import LevelBadge from '../ui/LevelBadge';
import './PublicLocationPage.css';

/**
 * Maps raw gender values to user-friendly display labels.
 */
function formatGender(gender) {
  const map = { male: "Men's", female: "Women's", coed: 'Co-ed' };
  return map[gender?.toLowerCase()] || gender;
}

/**
 * Convert a player name to a URL-safe slug.
 * @param {string} text - e.g. "John Doe"
 * @returns {string} e.g. "john-doe"
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Public location landing page for SEO and unauthenticated visitors.
 * Shows location info, leagues, top players, courts, and aggregate stats.
 *
 * @param {Object} props
 * @param {Object} props.location - Public location data from the API
 * @param {boolean} props.isAuthenticated - Whether the current user is logged in
 */
export default function PublicLocationPage({ location, isAuthenticated }) {
  const { openAuthModal } = useAuthModal();

  if (!location) {
    return (
      <div className="public-location-empty">
        <h1>Location Not Found</h1>
        <p>This location could not be found on Beach League Volleyball.</p>
      </div>
    );
  }

  const handleSignIn = () => openAuthModal('sign-in');
  const handleSignUp = () => openAuthModal('sign-up');

  const { stats, leagues, top_players, courts, region } = location;

  return (
    <div className="public-location">
      {/* Location header */}
      <div className="public-location__header">
        <h1 className="public-location__title">
          Beach Volleyball in {location.city}, {location.state}
        </h1>
        {region && (
          <span className="public-location__region">{region.name}</span>
        )}
      </div>

      {/* Aggregate stats */}
      {stats && (
        <div className="public-location__stats">
          <div className="public-location__stat">
            <span className="public-location__stat-value">{stats.total_leagues || 0}</span>
            <span className="public-location__stat-label">Leagues</span>
          </div>
          <div className="public-location__stat">
            <span className="public-location__stat-value">{stats.total_players || 0}</span>
            <span className="public-location__stat-label">Players</span>
          </div>
          <div className="public-location__stat">
            <span className="public-location__stat-value">{stats.total_matches || 0}</span>
            <span className="public-location__stat-label">Matches</span>
          </div>
        </div>
      )}

      {/* Auth prompt for unauthenticated users */}
      {!isAuthenticated && (
        <div className="public-location__auth-prompt">
          <span className="public-location__auth-prompt-text">
            <button className="public-location__auth-prompt-link" onClick={handleSignIn}>Log in</button>
            {' or '}
            <button className="public-location__auth-prompt-link" onClick={handleSignUp}>sign up</button>
            {' to join leagues and track your stats'}
          </span>
        </div>
      )}

      {/* Leagues section */}
      {leagues?.length > 0 && (
        <section className="public-location__section">
          <h2 className="public-location__section-title">Leagues</h2>
          <div className="public-location__leagues">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/league/${league.id}`}
                className="public-location__league-card"
              >
                <span className="public-location__league-name">{league.name}</span>
                <div className="public-location__league-meta">
                  {league.gender && (
                    <span className="public-location__badge">{formatGender(league.gender)}</span>
                  )}
                  {league.level && <LevelBadge level={league.level} />}
                  <span className="public-location__league-members">
                    {league.member_count} member{league.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top players section */}
      {top_players?.length > 0 && (
        <section className="public-location__section">
          <h2 className="public-location__section-title">Top Players</h2>
          <div className="public-location__players">
            {top_players.map((player) => (
              <Link
                key={player.id}
                href={`/player/${player.id}/${slugify(player.full_name)}`}
                className="public-location__player-row"
              >
                <div className="public-location__player-avatar">{player.avatar}</div>
                <div className="public-location__player-info">
                  <span className="public-location__player-name">{player.full_name}</span>
                  <span className="public-location__player-stats">
                    {Math.round(player.current_rating)} rating
                    {' \u00B7 '}
                    {player.total_wins}W\u2013{player.total_games - player.total_wins}L
                  </span>
                </div>
                {player.level && <LevelBadge level={player.level} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Courts section */}
      {courts?.length > 0 && (
        <section className="public-location__section">
          <h2 className="public-location__section-title">Courts</h2>
          <div className="public-location__courts">
            {courts.map((court) => (
              <div key={court.id} className="public-location__court-card">
                <span className="public-location__court-name">{court.name}</span>
                {court.address && (
                  <span className="public-location__court-address">{court.address}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer CTA */}
      {!isAuthenticated && (
        <div className="public-location__footer">
          <p>Join the beach volleyball community in {location.city}</p>
          <div className="public-location__cta-buttons">
            <Button onClick={handleSignIn}>Log In</Button>
            <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
          </div>
        </div>
      )}
    </div>
  );
}
