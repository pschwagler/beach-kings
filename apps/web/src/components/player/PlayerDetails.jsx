import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, UserCheck, Clock, Share2 } from 'lucide-react';
import Link from 'next/link';
import PlayerSelector from './PlayerSelector';
import PlayerOverview from './PlayerOverview';
import MatchHistoryTable from '../match/MatchHistoryTable';
import PlayerStatsTable from './PlayerStatsTable';
import { slugify } from '../../utils/slugify';
import { useAuth } from '../../contexts/AuthContext';
import { batchFriendStatus, sendFriendRequest, getPlayerInviteUrl } from '../../services/api';
import useShare from '../../hooks/useShare';

export default function PlayerDetails({ playerId, playerName, stats, matchHistory, onClose, allPlayers, onPlayerChange, leagueName, seasonName, isPlaceholder = false }) {
  const { isAuthenticated, currentUserPlayer } = useAuth();
  const [friendStatus, setFriendStatus] = useState(null);
  const [friendLoading, setFriendLoading] = useState(false);
  const [showFriendSentBubble, setShowFriendSentBubble] = useState(false);
  const isSelf = currentUserPlayer?.id === playerId;

  // Fetch friend status for registered players only
  useEffect(() => {
    if (!isAuthenticated || !playerId || isSelf || isPlaceholder) {
      setFriendStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await batchFriendStatus([playerId]);
        if (!cancelled) {
          setFriendStatus(data.statuses?.[String(playerId)] || 'none');
        }
      } catch (_) {
        if (!cancelled) setFriendStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, playerId, isSelf, isPlaceholder]);

  const handleAddFriend = useCallback(async () => {
    setFriendLoading(true);
    try {
      await sendFriendRequest(playerId);
      setFriendStatus('pending_outgoing');
      setShowFriendSentBubble(true);
      setTimeout(() => setShowFriendSentBubble(false), 2500);
    } catch (_) {
      // Silently fail — user can retry from full profile
    } finally {
      setFriendLoading(false);
    }
  }, [playerId]);

  const { shareInvite } = useShare();
  const [inviteUrl, setInviteUrl] = useState(null);

  // Pre-fetch invite URL when drawer opens for a placeholder player
  useEffect(() => {
    if (!isPlaceholder || !playerId) {
      setInviteUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getPlayerInviteUrl(playerId);
        if (!cancelled) setInviteUrl(data.invite_url);
      } catch {
        // No pending invite for this placeholder
      }
    })();
    return () => { cancelled = true; };
  }, [isPlaceholder, playerId]);

  /**
   * Share the pre-fetched invite URL. Must be synchronous from click
   * to preserve transient user activation for navigator.share().
   */
  const handleInviteShare = useCallback(() => {
    if (!inviteUrl) return;
    shareInvite({ name: playerName, url: inviteUrl });
  }, [playerName, inviteUrl, shareInvite]);

  const overview = stats?.overview || {};
  const playerStats = stats?.stats || [];
  const hasStats = playerStats.length > 0;
  // Determine if this is a season view (has seasonName) or league view (All Seasons)
  const isSeason = !!seasonName;
  // For season: check for ranking/points. For league: check for games/win_rate
  const hasOverview = overview && (
    isSeason 
      ? (overview.ranking !== undefined || overview.points !== undefined || overview.rating !== undefined)
      : (overview.games !== undefined || overview.win_rate !== undefined || overview.rating !== undefined)
  );

  return (
    <div className="player-details">
      <button className="player-details-close-btn" onClick={onClose} aria-label="Close player details">
        <X size={20} />
      </button>
      
      <PlayerSelector
        playerName={playerName}
        allPlayers={allPlayers}
        onPlayerChange={onPlayerChange}
        isPlaceholder={isPlaceholder}
      />

      {playerId && playerName && (
        <div className="player-details__profile-row">
          {isPlaceholder ? (
            <button
              className="player-details__invite-btn"
              onClick={handleInviteShare}
              disabled={!inviteUrl}
            >
              <Share2 size={13} /> {inviteUrl ? 'Invite to claim profile' : 'Loading...'}
            </button>
          ) : (
            <>
              <Link
                href={`/player/${playerId}/${slugify(playerName)}`}
                className="player-details__profile-link"
                onClick={onClose}
              >
                View full profile
              </Link>
              {isAuthenticated && !isSelf && friendStatus && friendStatus !== 'friend' && friendStatus !== 'pending_outgoing' && (
                <button
                  className="player-details__friend-btn"
                  onClick={handleAddFriend}
                  disabled={friendLoading}
                  title="Add friend"
                >
                  <UserPlus size={15} />
                </button>
              )}
              {isAuthenticated && !isSelf && friendStatus === 'pending_outgoing' && (
                <span className="player-details__friend-btn player-details__friend-btn--pending" title="Request sent">
                  <Clock size={15} />
                </span>
              )}
              {isAuthenticated && !isSelf && friendStatus === 'friend' && (
                <span className="player-details__friend-btn player-details__friend-btn--active" title="Friends">
                  <UserCheck size={15} />
                </span>
              )}
            </>
          )}
        </div>
      )}

      {showFriendSentBubble && (
        <div className="player-details__sent-bubble">Friend request sent!</div>
      )}

      {(leagueName || seasonName) && (
        <div className="player-details-season-name">
          {`${leagueName} - ${seasonName || 'All seasons'}`}
        </div>
      )}

      {hasOverview && (
        <PlayerOverview overview={overview} isSeason={isSeason} />
      )}

      {matchHistory && matchHistory.length > 0 && (
        <MatchHistoryTable 
          matchHistory={matchHistory}
          onPlayerChange={onPlayerChange}
        />
      )}

      {hasStats ? (
        <PlayerStatsTable 
          playerStats={playerStats}
          onPlayerChange={onPlayerChange}
        />
      ) : !hasOverview && (
        <div className="loading loading-message">
          No stats available yet. This player's games haven't been included in calculations.
          {matchHistory && matchHistory.length > 0 && (
            <div className="loading-submessage">
              They have {matchHistory.length} match{matchHistory.length !== 1 ? 'es' : ''} in an active session.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
