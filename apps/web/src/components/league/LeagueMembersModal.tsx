import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, Users, MapPin, LogIn, UserRoundPlus, ExternalLink } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { getLeagueMembers } from '../../services/api';
import { formatRelativeTime } from '../../utils/dateUtils';
import { slugify } from '../../utils/slugify';
import LevelBadge from '../ui/LevelBadge';
import ShareInviteIcon from '../player/ShareInviteIcon';
import { isImageUrl } from '../../utils/avatar';

interface LeagueMember {
  id: number;
  player_id?: number | null;
  player_name?: string | null;
  player_avatar?: string | null;
  player_level?: string | null;
  is_placeholder?: boolean | null;
  joined_at?: string | null;
}

interface LeagueMembersModalProps {
  leagueId: number;
  leagueName: string;
  locationName?: string;
  level?: string;
  gender?: string;
  memberCount?: number;
  isOpenLeague?: boolean;
  isMember?: boolean;
  onJoin?: () => void;
  onClose: () => void;
}

export default function LeagueMembersModal({
  leagueId,
  leagueName,
  locationName,
  level,
  gender,
  memberCount,
  isOpenLeague,
  isMember,
  onJoin,
  onClose
}: LeagueMembersModalProps) {
  const dialogRef = useDialog(onClose);
  const [members, setMembers] = useState<LeagueMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeagueMembers(leagueId);
        setMembers(data);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } } };
        setError(e.response?.data?.detail || 'Failed to load league members');
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchMembers();
    }
  }, [leagueId]);

  const formatJoinDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    const relative = formatRelativeTime(dateString);
    return relative || 'Unknown';
  };

  const getAvatarInitial = (playerName: string): string => {
    if (!playerName) return '?';
    return playerName.trim().charAt(0).toUpperCase();
  };

  const handleGoToLeague = () => {
    if (!leagueId) return;
    router.push(`/league/${leagueId}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="league-members-title" className="modal-content league-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div>
              {isMember ? (
                <button
                  type="button"
                  className="league-members-link-inline"
                  onClick={handleGoToLeague}
                >
                  <span id="league-members-title" className="league-members-modal-title">
                    {leagueName || 'League'}
                  </span>
                  <ExternalLink size={16} />
                </button>
              ) : (
                <h2 id="league-members-title" className="league-members-modal-title">{leagueName || 'League'}</h2>
              )}
              {locationName && (
                <div className="modal-subtitle">
                  <MapPin size={14} />
                  <span>{locationName}</span>
                </div>
              )}
            </div>
          </div>
          <div className="modal-header-actions">
            {isMember && (
              <span
                className="leagues-table-member-indicator"
                data-tooltip="You're already a member of this league"
                aria-label="You're already a member of this league"
              >
                You&apos;re a member
              </span>
            )}
            {!isMember && onJoin && (
              <button
                type="button"
                className="leagues-table-join-button"
                onClick={onJoin}
              >
                {isOpenLeague ? (
                  <>
                    <LogIn size={14} />
                    Join
                  </>
                ) : (
                  <>
                    <UserRoundPlus size={14} />
                    Request to Join
                  </>
                )}
              </button>
            )}
            <button className="modal-close-button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="league-members-header">
            <div className="league-members-title">
              <Users size={18} />
              <span>League Members ({memberCount || members?.length || 0})</span>
            </div>
            <div className="league-members-meta">
              <LevelBadge level={level} />
              {gender && (
                <span className="gender-badge">
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading members...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : members && members.length > 0 ? (
            <div className="league-members-list">
              {members.map((member) => (
                <div key={member.id} className="league-member-item">
                  <div className="league-member-info">
                    <div className="league-member-avatar">
                      {isImageUrl(member.player_avatar) ? (
                        <div className="player-avatar player-avatar-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={member.player_avatar ?? undefined} alt={member.player_name || 'Player'} />
                        </div>
                      ) : (
                        <div className="player-avatar player-avatar-initials">
                          <span className="player-avatar-text">
                            {member.player_avatar || getAvatarInitial(member.player_name ?? '')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="league-member-left">
                      {member.player_id && member.player_name ? (
                        <Link
                          href={`/player/${member.player_id}/${slugify(member.player_name)}`}
                          className="league-member-name league-member-name--link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {member.player_name}
                        </Link>
                      ) : (
                        <span className="league-member-name">{member.player_name || 'Unknown'}</span>
                      )}
                      {member.is_placeholder && <ShareInviteIcon playerId={member.player_id ?? 0} playerName={member.player_name ?? ''} />}
                      {member.joined_at && (
                        <span className="league-member-joined">
                          Joined {formatJoinDate(member.joined_at)}
                        </span>
                      )}
                    </div>
                    <LevelBadge level={member.player_level ?? undefined} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No members found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

