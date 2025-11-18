import { Users, Plus, X } from 'lucide-react';
import { getPlayerDisplayName } from './utils/leagueUtils';
import { ROLE_OPTIONS } from './utils/leagueUtils';

export default function PlayersSection({
  sortedMembers,
  currentUserPlayer,
  isAdmin,
  onAddPlayers,
  onRoleChange,
  onRemoveMember
}) {
  return (
    <div className="league-players-section">
      <div className="league-section-header">
        <h3 className="league-section-title">
          <Users size={18} />
          Players
        </h3>
        {isAdmin && (
          <button className="league-text-button" onClick={onAddPlayers}>
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
            const isCurrentUser = currentUserPlayer && member.player_id === currentUserPlayer.id;
            const playerName = member.player_name || `Player ${member.player_id}`;
            const displayName = getPlayerDisplayName(member, isCurrentUser);
            const canEdit = isAdmin && !isCurrentUser;

            return (
              <div key={member.id} className={`league-player-row ${!canEdit ? 'disabled' : ''}`}>
                <div className="league-player-info">
                  <span className="league-player-name">{displayName}</span>
                </div>
                <div className="league-player-actions">
                  <span className="league-player-role">
                    {canEdit ? (
                      <select
                        value={member.role}
                        onChange={(e) => onRoleChange(member.id, e.target.value)}
                        className="league-role-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="league-role-badge">{member.role}</span>
                    )}
                  </span>
                  {canEdit && (
                    <button
                      className="league-player-remove"
                      onClick={() => onRemoveMember(member.id, playerName)}
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

