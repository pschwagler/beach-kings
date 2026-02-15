import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, Users, MapPin, LogIn, UserRoundPlus, ExternalLink } from 'lucide-react';
import { getLeagueMembers } from '../../services/api';
import { formatRelativeTime } from '../../utils/dateUtils';
import { slugify } from '../../utils/slugify';
import LevelBadge from '../ui/LevelBadge';
import { isImageUrl } from '../../utils/avatar';

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
}) {
  const [members, setMembers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeagueMembers(leagueId);
        setMembers(data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load league members');
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchMembers();
    }
  }, [leagueId]);

  const formatJoinDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const relative = formatRelativeTime(dateString);
    return relative || 'Unknown';
  };

  const getAvatarInitial = (playerName) => {
    if (!playerName) return '?';
    return playerName.trim().charAt(0).toUpperCase();
  };

  const handleGoToLeague = () => {
    if (!leagueId) return;
    router.push(`/league/${leagueId}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content league-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div>
              {isMember ? (
                <button
                  type="button"
                  className="league-members-link-inline"
                  onClick={handleGoToLeague}
                >
                  <span className="league-members-modal-title">
                    {leagueName || 'League'}
                  </span>
                  <ExternalLink size={16} />
                </button>
              ) : (
                <h2 className="league-members-modal-title">{leagueName || 'League'}</h2>
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
                title="You're already a member of this league"
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
                          <img src={member.player_avatar} alt={member.player_name || 'Player'} />
                        </div>
                      ) : (
                        <div className="player-avatar player-avatar-initials">
                          <span className="player-avatar-text">
                            {member.player_avatar || getAvatarInitial(member.player_name)}
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
                      {member.joined_at && (
                        <span className="league-member-joined">
                          Joined {formatJoinDate(member.joined_at)}
                        </span>
                      )}
                    </div>
                    <LevelBadge level={member.player_level} />
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

