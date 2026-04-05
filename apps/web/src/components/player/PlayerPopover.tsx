import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { User, MessageCircle, UserPlus, Clock, UserCheck } from 'lucide-react';
import { batchFriendStatus, sendFriendRequest, getFriendRequests, acceptFriendRequest } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { slugify } from '../../utils/slugify';
import './PlayerPopover.css';

interface PlayerPopoverProps {
  playerId: number | null;
  playerName: string;
  anchorRect: DOMRect | null;
  onClose: () => void;
  friendStatusCache?: Record<number, string>;
  onCacheUpdate?: (playerId: number, status: string) => void;
}

/**
 * Lightweight popover for player names. Shows quick actions:
 * View Profile, Message (if friends), Add Friend / Pending / Accept.
 */
export default function PlayerPopover({
  playerId,
  playerName,
  anchorRect,
  onClose,
  friendStatusCache = {},
  onCacheUpdate,
}: PlayerPopoverProps) {
  const router = useRouter();
  const { isAuthenticated, currentUserPlayer } = useAuth();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [friendStatus, setFriendStatus] = useState<string | null>(playerId != null ? (friendStatusCache[playerId] || null) : null);
  const [loading, setLoading] = useState(playerId != null && !friendStatusCache[playerId] && isAuthenticated && playerId !== currentUserPlayer?.id);
  const [actionLoading, setActionLoading] = useState(false);
  const [incomingRequestId, setIncomingRequestId] = useState<number | null>(null);

  const isSelf = playerId === currentUserPlayer?.id;

  // Fetch friend status on mount if not cached
  useEffect(() => {
    if (!isAuthenticated || !playerId || isSelf || friendStatusCache[playerId]) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await batchFriendStatus([playerId]);
        if (cancelled) return;
        const status = result.statuses?.[String(playerId)] || 'none';
        setFriendStatus(status);
        onCacheUpdate?.(playerId, status);

        // If pending_incoming, fetch the request ID so we can accept it
        if (status === 'pending_incoming') {
          const requests = await getFriendRequests('received');
          if (cancelled) return;
          const match = requests.find((r: any) => r.sender_player_id === playerId && r.status === 'pending');
          if (match) setIncomingRequestId(match.id);
        }
      } catch {
        if (!cancelled) setFriendStatus('none');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerId, isAuthenticated, isSelf, friendStatusCache, onCacheUpdate]);

  // Escape key to dismiss
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Compute position (below the anchor, clamped to viewport)
  const getStyle = useCallback(() => {
    if (!anchorRect) return {};
    const gap = 6;
    let top = anchorRect.bottom + gap;
    let left = anchorRect.left + anchorRect.width / 2;

    // Clamp: don't overflow right
    const popoverWidth = 260;
    if (left + popoverWidth / 2 > window.innerWidth - 12) {
      left = window.innerWidth - 12 - popoverWidth / 2;
    }
    if (left - popoverWidth / 2 < 12) {
      left = 12 + popoverWidth / 2;
    }

    // If near bottom, show above
    if (top + 180 > window.innerHeight) {
      top = anchorRect.top - gap - 180;
      if (top < 12) top = 12;
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      transform: 'translateX(-50%)',
    };
  }, [anchorRect]);

  const handleViewProfile = () => {
    router.push(`/player/${playerId}/${slugify(playerName)}`);
    onClose();
  };

  const handleMessage = () => {
    router.push(`/home?tab=messages&thread=${playerId}`);
    onClose();
  };

  const handleAddFriend = async () => {
    if (actionLoading || !playerId) return;
    setActionLoading(true);
    try {
      await sendFriendRequest(playerId);
      setFriendStatus('pending_outgoing');
      onCacheUpdate?.(playerId, 'pending_outgoing');
    } catch {
      // Silently fail — user may already have a pending request
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (actionLoading || !incomingRequestId) return;
    setActionLoading(true);
    try {
      await acceptFriendRequest(incomingRequestId);
      setFriendStatus('friend');
      if (playerId != null) onCacheUpdate?.(playerId, 'friend');
    } catch {
      // Silently fail
    } finally {
      setActionLoading(false);
    }
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <>
      <div className="player-popover-backdrop" onClick={onClose} />
      <div className="player-popover" ref={popoverRef} style={getStyle()}>
        <div className="player-popover__header">{playerName}</div>

        <button className="player-popover__item" onClick={handleViewProfile} type="button">
          <User size={16} />
          View Profile
        </button>

        {isAuthenticated && !isSelf && (
          <>
            {loading ? (
              <div className="player-popover__loading">
                <span className="player-popover__spinner" />
                Loading…
              </div>
            ) : (
              <>
                {friendStatus === 'friend' ? (
                  <button className="player-popover__item player-popover__item--primary" onClick={handleMessage} type="button">
                    <MessageCircle size={16} />
                    Message
                  </button>
                ) : (
                  <span
                    className="player-popover__item player-popover__item--disabled"
                    data-tooltip="Player must be a friend before messaging"
                    aria-label="Player must be a friend before messaging"
                  >
                    <MessageCircle size={16} />
                    Message
                  </span>
                )}

                {friendStatus === 'none' && (
                  <button
                    className="player-popover__item player-popover__item--success"
                    onClick={handleAddFriend}
                    disabled={actionLoading}
                    type="button"
                  >
                    <UserPlus size={16} />
                    {actionLoading ? 'Sending…' : 'Add Friend'}
                  </button>
                )}

                {friendStatus === 'pending_outgoing' && (
                  <span className="player-popover__item player-popover__item--disabled">
                    <Clock size={16} />
                    Request Pending
                  </span>
                )}

                {friendStatus === 'pending_incoming' && (
                  <button
                    className="player-popover__item player-popover__item--success"
                    onClick={handleAcceptRequest}
                    disabled={actionLoading}
                    type="button"
                  >
                    <UserCheck size={16} />
                    {actionLoading ? 'Accepting…' : 'Accept Request'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
