'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, UserCheck, Clock, Users, MessageCircle, MapPin, Star } from 'lucide-react';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/UI';
import LevelBadge from '../ui/LevelBadge';
import { formatGender } from '../../utils/formatters';
import { isImageUrl } from '../../utils/avatar';
import {
  batchFriendStatus,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getMutualFriends,
  getFriendRequests,
  getPlayerHomeCourts,
  addPlayerHomeCourt,
  removePlayerHomeCourt,
  reorderPlayerHomeCourts,
} from '../../services/api';
import useHomeCourts from '../../hooks/useHomeCourts';
import { slugify } from '../../utils/slugify';
import { useToast } from '../../contexts/ToastContext';
import PlayerTrophies from './PlayerTrophies';
import CourtSelector from '../court/CourtSelector';
import './PublicPlayerPage.css';

/**
 * Public player profile page for SEO and unauthenticated visitors.
 * Shows player info, stats, location, league memberships, and friend actions.
 *
 * @param {Object} props
 * @param {Object} props.player - Public player data from the API
 * @param {boolean} props.isAuthenticated - Whether the current user is logged in
 */
export default function PublicPlayerPage({ player, isAuthenticated }) {
  const { openAuthModal } = useAuthModal();
  const { currentUserPlayer } = useAuth();
  const router = useRouter();
  const [friendStatus, setFriendStatus] = useState(null); // 'friend'|'pending_outgoing'|'pending_incoming'|'none'|'self'
  const [incomingRequestId, setIncomingRequestId] = useState(null);
  const [mutualFriends, setMutualFriends] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();

  const isSelf = currentUserPlayer?.id === player?.id;

  const {
    homeCourts,
    handleConfirm: handleCourtConfirm,
    handleRemove: handleRemoveHomeCourt,
    handleSetPrimary,
  } = useHomeCourts({
    entityId: player?.id,
    api: { get: getPlayerHomeCourts, add: addPlayerHomeCourt, remove: removePlayerHomeCourt, reorder: reorderPlayerHomeCourts },
  });

  // Fetch friend status and mutual friends for authenticated users
  useEffect(() => {
    if (!isAuthenticated || !player?.id) return;

    // Self-detection: skip API call if viewing own profile
    if (currentUserPlayer?.id === player.id) {
      setFriendStatus('self');
      return;
    }

    const load = async () => {
      try {
        const statusData = await batchFriendStatus([player.id]);
        const status = statusData.statuses?.[String(player.id)] || 'none';
        setFriendStatus(status);

        // If incoming, find the request ID
        if (status === 'pending_incoming') {
          const requests = await getFriendRequests('incoming');
          const match = requests.find((r) => r.sender_player_id === player.id);
          if (match) setIncomingRequestId(match.id);
        }

        // Fetch mutual friends if not already friends
        if (status !== 'friend' && status !== 'self') {
          const mutual = await getMutualFriends(player.id);
          setMutualFriends(mutual || []);
        }
      } catch (err) {
        console.error('Error loading friend data:', err);
      }
    };
    load();
  }, [isAuthenticated, player?.id, currentUserPlayer?.id]);

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

  const handleSendRequest = async () => {
    setActionLoading(true);
    try {
      await sendFriendRequest(player.id);
      setFriendStatus('pending_outgoing');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to send friend request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!incomingRequestId) return;
    setActionLoading(true);
    try {
      await acceptFriendRequest(incomingRequestId);
      setFriendStatus('friend');
      setMutualFriends([]);
      showToast('Friend request accepted!', 'success');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to accept friend request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    setActionLoading(true);
    try {
      await removeFriend(player.id);
      setFriendStatus('none');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to remove friend', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const { stats } = player;

  const renderFriendButton = () => {
    if (!isAuthenticated || friendStatus === null || friendStatus === 'self') return null;

    if (friendStatus === 'friend') {
      return (
        <button
          className="public-player__friend-icon public-player__friend-icon--active"
          data-testid="friend-active-btn"
          onClick={handleUnfriend}
          disabled={actionLoading}
          data-tooltip="Friends — click to unfriend"
        >
          <UserCheck size={20} />
        </button>
      );
    }
    if (friendStatus === 'pending_outgoing') {
      return (
        <button
          className="public-player__friend-icon public-player__friend-icon--pending"
          data-testid="friend-pending-btn"
          disabled
          data-tooltip="Friend request sent"
        >
          <Clock size={20} />
        </button>
      );
    }
    if (friendStatus === 'pending_incoming') {
      return (
        <button
          className="public-player__friend-icon public-player__friend-icon--incoming"
          data-testid="friend-incoming-btn"
          onClick={handleAcceptRequest}
          disabled={actionLoading}
          data-tooltip="Accept friend request"
        >
          <UserPlus size={20} />
        </button>
      );
    }
    return (
      <button
        className="public-player__friend-icon"
        data-testid="friend-add-btn"
        onClick={handleSendRequest}
        disabled={actionLoading}
        data-tooltip="Add friend"
      >
        <UserPlus size={20} />
      </button>
    );
  };

  return (
    <div className="public-player">
      {/* Player header: avatar, name, meta */}
      <div className="public-player__header">
        <div className="public-player__avatar">
          {isImageUrl(player.avatar) ? (
            <img
              src={player.avatar}
              alt={player.full_name}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            player.avatar
          )}
        </div>
        <div className="public-player__info">
          <h1 className="public-player__name" data-testid="player-name">{player.full_name}</h1>
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
        {/* Friend action icons */}
        <div className="public-player__friend-action">
          {isAuthenticated && friendStatus !== 'self' && (
            friendStatus === 'friend' ? (
              <button
                className="public-player__friend-icon public-player__friend-icon--message"
                data-testid="player-message-btn"
                onClick={() => router.push(`/home?tab=messages&thread=${player.id}`)}
                data-tooltip="Send message"
              >
                <MessageCircle size={20} />
              </button>
            ) : (
              <span
                className="public-player__friend-icon public-player__friend-icon--disabled"
                data-tooltip="Must be friends to message"
              >
                <MessageCircle size={20} />
              </span>
            )
          )}
          {renderFriendButton()}
        </div>
      </div>

      {/* Auth prompt for unauthenticated users */}
      {!isAuthenticated && (
        <div className="public-player__auth-prompt">
          <span className="public-player__auth-prompt-text">
            <button className="public-player__auth-prompt-link" onClick={handleSignIn} aria-label="Log in to Beach League">Log in</button>
            {' or '}
            <button className="public-player__auth-prompt-link" onClick={handleSignUp} aria-label="Sign up for Beach League">sign up</button>
            {' to join leagues and track your stats'}
          </span>
        </div>
      )}

      {/* Mutual friends */}
      {isAuthenticated && mutualFriends.length > 0 && (
        <section className="public-player__section">
          <h2 className="public-player__section-title">
            <Users size={16} /> {mutualFriends.length} Mutual Friend{mutualFriends.length !== 1 ? 's' : ''}
          </h2>
          <div className="public-player__mutual-friends">
            {mutualFriends.map((mf) => (
              <Link
                key={mf.player_id}
                href={`/player/${mf.player_id}/${slugify(mf.full_name)}`}
                className="public-player__mutual-friend"
              >
                <div className="public-player__mutual-friend-avatar">
                  {isImageUrl(mf.avatar) ? (
                    <img src={mf.avatar} alt={mf.full_name} />
                  ) : (
                    mf.avatar || mf.full_name?.charAt(0)
                  )}
                </div>
                <span className="public-player__mutual-friend-name" data-testid="mutual-friend-name">{mf.full_name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trophies — renders nothing if player has no awards */}
      {player?.id && <PlayerTrophies playerId={player.id} />}

      {/* Home Courts */}
      {(homeCourts.length > 0 || isSelf) && (
        <section className="public-player__section">
          <h2 className="public-player__section-title">
            <MapPin size={16} /> Home Courts
          </h2>
          {isSelf ? (
            <>
              {homeCourts.length === 0 && (
                <p className="public-player__home-courts-empty">
                  Add your favorite courts so others can find you
                </p>
              )}
              <CourtSelector
                mode="multi"
                selectedCourts={homeCourts}
                onAdd={(court) => handleCourtConfirm([...homeCourts, court])}
                onRemove={handleRemoveHomeCourt}
                onSetPrimary={handleSetPrimary}
                preFilterLocationId={player.location?.id}
              />
            </>
          ) : homeCourts.length > 0 ? (
            <div className="public-player__home-courts">
              {homeCourts.map((court, i) => (
                <Link
                  key={court.id}
                  href={`/courts/${court.id}`}
                  className={`public-player__court-pill${i === 0 && homeCourts.length > 1 ? ' public-player__court-pill--primary' : ''}`}
                >
                  {i === 0 && homeCourts.length > 1 && (
                    <Star size={12} className="public-player__court-pill-star--active" />
                  )}
                  {court.name}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* Stats grid */}
      {stats && (
        <section className="public-player__section">
          <h2 className="public-player__section-title">Stats</h2>
          <div className="public-player__stats" data-testid="player-stats">
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
        <div className="public-player__footer" data-testid="player-footer">
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
