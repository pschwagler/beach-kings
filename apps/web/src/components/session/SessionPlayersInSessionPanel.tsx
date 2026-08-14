'use client';

import { X, MapPin, UserPlus, Check, Clock } from 'lucide-react';
import { formatDivisionLabel } from '../../utils/divisionUtils';
import type { SessionParticipant } from './types';

/**
 * Presentational panel showing the list of players currently in the session.
 * Renders name, division label, location pill, friend action, and Remove (or Creator badge).
 */
interface SessionPlayersInSessionPanelProps {
  participants?: SessionParticipant[];
  sessionCreatedByPlayerId?: number | null;
  currentUserPlayerId?: number | null;
  onRemove: (playerId: number) => void;
  removingId?: number | null;
  friendStatuses?: Record<string, string>;
  friendStatusesLoaded?: boolean;
  friendActionLoading?: Record<string, boolean>;
  onAddFriend?: (playerId: number) => void;
}

export default function SessionPlayersInSessionPanel({
  participants = [],
  sessionCreatedByPlayerId = null,
  currentUserPlayerId = null,
  onRemove,
  removingId,
  friendStatuses = {},
  friendStatusesLoaded = false,
  friendActionLoading = {},
  onAddFriend,
}: SessionPlayersInSessionPanelProps) {
  return (
    <section
      id="session-players-in-session-panel"
      role="tabpanel"
      aria-labelledby="session-players-tab-in-session"
      className="session-players-column session-players-in-session"
    >
      <div className="session-players-column-scroll">
        {participants.length === 0 ? (
          <p className="session-players-empty">
            No players yet. Switch to &quot;Add players&quot; to add people.
          </p>
        ) : (
          <ul className="session-players-list">
            {participants.map((p) => {
              const isCreatorRemovingSelf =
                sessionCreatedByPlayerId != null &&
                currentUserPlayerId != null &&
                p.player_id === sessionCreatedByPlayerId &&
                p.player_id === currentUserPlayerId;
              const name = p.full_name || p.player_name || `Player ${p.player_id}`;
              const division = formatDivisionLabel(p.gender, p.level);
              return (
                <li key={p.player_id} className="session-players-list-item">
                  <div className="session-players-row-content">
                    <span className="session-players-row-name">{name}</span>
                    <span className="session-players-row-meta-wrap">
                      {division && (
                        <span className="session-players-row-meta" aria-hidden="true">
                          {division}
                        </span>
                      )}
                      {p.location_name && (
                        <span className="session-players-location-pill" aria-hidden="true">
                          <MapPin size={12} /> {p.location_name}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="session-players-row-actions">
                    {(() => {
                      const isSelf = currentUserPlayerId != null && p.player_id === currentUserPlayerId;
                      const isPlaceholder = !!p.is_placeholder;
                      if (isSelf || isPlaceholder || !onAddFriend || !friendStatusesLoaded) return null;
                      const status = friendStatuses[String(p.player_id)];
                      const isLoading = !!friendActionLoading[String(p.player_id)];
                      if (status === 'friend') {
                        return (
                          <span className="session-players-friend-badge" title="Friends">
                            <Check size={12} /> Friends
                          </span>
                        );
                      }
                      if (status === 'pending_outgoing' || status === 'pending_incoming') {
                        return (
                          <span className="session-players-friend-badge pending" title="Friend request pending">
                            <Clock size={12} /> Pending
                          </span>
                        );
                      }
                      return (
                        <button
                          type="button"
                          className="session-players-add-friend"
                          onClick={() => onAddFriend(p.player_id)}
                          disabled={isLoading}
                          aria-label={`Add ${name} as friend`}
                          title="Send friend request"
                        >
                          <UserPlus size={12} /> {isLoading ? '...' : 'Add Friend'}
                        </button>
                      );
                    })()}
                    {!isCreatorRemovingSelf ? (
                      <button
                        type="button"
                        className="session-players-remove"
                        onClick={() => onRemove(p.player_id)}
                        disabled={!!removingId}
                        aria-label={`Remove ${name} from session`}
                        title="Remove from session (only if they have no games in this session)"
                      >
                        <X size={14} /> Remove
                      </button>
                    ) : (
                      <span className="session-players-creator-badge">Creator</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
