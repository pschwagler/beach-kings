import { useState, useEffect, useCallback } from 'react';
import { Share2 } from 'lucide-react';
import { getPlayerInviteUrl } from '../../services/api';
import useShare from '../../hooks/useShare';
import './ShareInviteIcon.css';

/**
 * Small inline share icon for placeholder (unregistered) players.
 * Pre-fetches the invite URL on mount, then fires the share flow
 * synchronously on click to preserve transient user activation.
 */
interface ShareInviteIconProps {
  playerId: number;
  playerName: string;
}

export default function ShareInviteIcon({ playerId, playerName }: ShareInviteIconProps) {
  const { shareInvite } = useShare();
  const [inviteUrl, setInviteUrl] = useState(null);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getPlayerInviteUrl(playerId);
        if (!cancelled) setInviteUrl(data.invite_url);
      } catch {
        // No invite URL available for this player
      }
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!inviteUrl) return;
    shareInvite({ name: playerName, url: inviteUrl });
  }, [inviteUrl, playerName, shareInvite]);

  return (
    <button
      type="button"
      className="share-invite-icon"
      onClick={handleClick}
      disabled={!inviteUrl}
      aria-label={`Invite ${playerName}`}
      title={inviteUrl ? `Invite ${playerName}` : 'Loading invite...'}
    >
      <Share2 size={11} />
    </button>
  );
}
