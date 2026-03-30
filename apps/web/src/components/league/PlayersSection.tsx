import { Users, Plus, X } from 'lucide-react';
import { getPlayerDisplayName } from './utils/leagueUtils';
import { ROLE_OPTIONS } from './utils/leagueUtils';
import { useLeague } from '../../contexts/LeagueContext';
import { formatRelativeTime } from '../../utils/dateUtils';

interface Member {
  id: number;
  player_id: number;
  player_name?: string | null;
  player_avatar?: string | null;
  role?: string | null;
  joined_at?: string | null;
}

interface PlayersSectionProps {
  sortedMembers: Member[];
  currentUserPlayer?: { id: number } | null;
  onAddPlayers?: () => void;
  onRoleChange?: (memberId: number, role: string) => void;
  onRemoveMember?: (memberId: number, playerName: string) => void;
}

function formatJoinDate(dateString: string): string {
  if (!dateString) return 'Unknown';
  const relative = formatRelativeTime(dateString);
  return relative || 'Unknown';
}

function isImageUrl(avatar: string | null | undefined): boolean {
  if (!avatar) return false;
  return avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/');
}

function getAvatarInitial(playerName: string | null | undefined): string {
  if (!playerName) return '?';
  return playerName.trim().charAt(0).toUpperCase();
}

export default function PlayersSection({
  sortedMembers,
  currentUserPlayer,
  onAddPlayers,
  onRoleChange,
  onRemoveMember
}: PlayersSectionProps) {
  const { isLeagueAdmin } = useLeague();

  return (
    <div className="league-players-section">
      <div className="league-section-header">
        <h3 className="league-section-title">
          <Users size={18} />
          Players
        </h3>
        {isLeagueAdmin && (
          <button type="button" className="league-text-button" onClick={onAddPlayers}>
            <Plus size={16} />
            Add Players
          </button>
        )}
      </div>

      {sortedMembers.length === 0 ? (
        <div className="league-empty-state">
          <Users size={40} />
          <p>No players yet</p>
        </div>
      ) : (
        <div className="league-players-list">
          {sortedMembers.map((member) => {
            const isCurrentUser =
              currentUserPlayer && member.player_id === currentUserPlayer.id;
            const playerName = member.player_name || `Player ${member.player_id}`;
            const displayName = getPlayerDisplayName(member, isCurrentUser ?? undefined);
            const canEdit = isLeagueAdmin && !isCurrentUser;

            return (
              <div
                key={member.id}
                className={`league-player-row ${!canEdit ? 'disabled' : ''}`}
              >
                <div className="league-player-info">
                  <div className="league-member-avatar">
                    {isImageUrl(member.player_avatar) ? (
                      <div className="player-avatar player-avatar-image">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={member.player_avatar ?? undefined}
                          alt={member.player_name || 'Player'}
                        />
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
                    <span className="league-member-name">{displayName}</span>
                    {member.joined_at && (
                      <span className="league-member-joined">
                        Joined {formatJoinDate(member.joined_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="league-player-actions">
                  <span className="league-player-role">
                    {canEdit ? (
                      <select
                        value={member.role ?? undefined}
                        onChange={(e) => onRoleChange?.(member.id, e.target.value)}
                        className="league-role-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`league-role-badge ${member.role === 'admin' ? 'league-role-badge-admin' : ''}`}>
                        {member.role}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <button
                      className="league-player-remove"
                      onClick={() => onRemoveMember?.(member.id, playerName)}
                      title="Remove player from league"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
