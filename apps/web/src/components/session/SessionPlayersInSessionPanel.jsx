'use client';

import { X, MapPin } from 'lucide-react';
import { formatDivisionLabel } from '../../utils/divisionUtils';

/**
 * Presentational panel showing the list of players currently in the session.
 * Renders name, division label, location pill, and Remove (or Creator badge).
 */
export default function SessionPlayersInSessionPanel({
  participants = [],
  sessionCreatedByPlayerId = null,
  currentUserPlayerId = null,
  onRemove,
  removingId,
}) {
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
