'use client';

import Link from 'next/link';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { Button } from '../ui/UI';
import LevelBadge from '../ui/LevelBadge';
import './PublicPlayerPage.css';

/**
 * Maps raw gender values to user-friendly display labels.
 */
function formatGender(gender) {
  const map = { male: "Men's", female: "Women's", coed: 'Co-ed' };
  return map[gender?.toLowerCase()] || gender;
}

/**
 * Public player profile page for SEO and unauthenticated visitors.
 * Shows player info, stats, location, and league memberships.
 *
 * @param {Object} props
 * @param {Object} props.player - Public player data from the API
 * @param {boolean} props.isAuthenticated - Whether the current user is logged in
 */
export default function PublicPlayerPage({ player, isAuthenticated }) {
  const { openAuthModal } = useAuthModal();

  if (!player) {
    return (
      <div className="public-player-empty">
        <h1>Player Not Found</h1>
        <p>This player doesn&apos;t exist or hasn&apos;t played any games yet.</p>
      </div>
    );
  }

  const handleSignIn = () => openAuthModal('sign-in');
  const handleSignUp = () => openAuthModal('sign-up');

  const { stats } = player;

  return (
    <div className="public-player">
      {/* Player header: avatar, name, meta */}
      <div className="public-player__header">
        <div className="public-player__avatar">{player.avatar}</div>
        <div className="public-player__info">
          <h1 className="public-player__name">{player.full_name}</h1>
          <div className="public-player__meta">
            {player.location && (
              <Link
                href={`/beach-volleyball/${player.location.slug}`}
                className="public-player__location-link"
              >
                {player.location.city}, {player.location.state}
              </Link>
            )}
            {player.gender && (
              <span className="public-player__badge">{formatGender(player.gender)}</span>
            )}
            {player.level && <LevelBadge level={player.level} />}
          </div>
        </div>
      </div>

      {/* Auth prompt for unauthenticated users */}
      {!isAuthenticated && (
        <div className="public-player__auth-prompt">
          <span className="public-player__auth-prompt-text">
            <button className="public-player__auth-prompt-link" onClick={handleSignIn}>Log in</button>
            {' or '}
            <button className="public-player__auth-prompt-link" onClick={handleSignUp}>sign up</button>
            {' to join leagues and track your stats'}
          </span>
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <section className="public-player__section">
          <h2 className="public-player__section-title">Stats</h2>
          <div className="public-player__stats">
            <div className="public-player__stat">
              <span className="public-player__stat-value">
                {Math.round(stats.current_rating || 0)}
              </span>
              <span className="public-player__stat-label">Rating</span>
            </div>
            <div className="public-player__stat">
              <span className="public-player__stat-value">{stats.total_games || 0}</span>
              <span className="public-player__stat-label">Games</span>
            </div>
            <div className="public-player__stat">
              <span className="public-player__stat-value">
                {stats.total_wins || 0}–{(stats.total_games || 0) - (stats.total_wins || 0)}
              </span>
              <span className="public-player__stat-label">W–L</span>
            </div>
            <div className="public-player__stat">
              <span className="public-player__stat-value">
                {stats.total_games > 0 ? `${Math.round(stats.win_rate * 100)}%` : '—'}
              </span>
              <span className="public-player__stat-label">Win Rate</span>
            </div>
          </div>
        </section>
      )}

      {/* League memberships */}
      {player.league_memberships?.length > 0 && (
        <section className="public-player__section">
          <h2 className="public-player__section-title">Leagues</h2>
          <div className="public-player__leagues">
            {player.league_memberships.map((league) => (
              <Link
                key={league.league_id}
                href={`/league/${league.league_id}`}
                className="public-player__league-card"
              >
                {league.league_name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer CTA */}
      {!isAuthenticated && (
        <div className="public-player__footer">
          <p>Sign up to join leagues and play against {player.full_name}</p>
          <div className="public-player__cta-buttons">
            <Button onClick={handleSignIn}>Log In</Button>
            <Button variant="outline" onClick={handleSignUp}>Sign Up</Button>
          </div>
        </div>
      )}
    </div>
  );
}
