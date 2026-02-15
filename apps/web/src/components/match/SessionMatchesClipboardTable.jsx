import { Edit2 } from 'lucide-react';

/**
 * Presentational clipboard table for session matches.
 * Winner names and scores use primary-dark; loser names and scores use gray-800.
 */
export default function SessionMatchesClipboardTable({
  matches,
  onPlayerClick,
  onEditMatch,
  canAddMatch = false,
  onAddMatch,
  sessionId,
  seasonId,
  showActions = false,
  lastUpdated = null,
  formatRelativeTime = (date) => date,
}) {
  const colSpan = showActions ? 6 : 6;

  return (
    <div className="clipboard-table-wrapper">
      <table className="clipboard-table">
        <colgroup>
          <col className="clipboard-col-id" />
          <col className="clipboard-col-team" />
          <col className="clipboard-col-score" />
          <col className="clipboard-col-score" />
          <col className="clipboard-col-team" />
          {showActions && <col />}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Team 1</th>
            <th colSpan={2} className="clipboard-score-header">Score</th>
            <th className="clipboard-col-team2">Team 2</th>
            {showActions && <th className="clipboard-actions-header" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {!matches || matches.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="empty-table-cell">
                No matches recorded yet.
              </td>
            </tr>
          ) : (
            matches.map((match, idx) => {
              const t1p1 = match['Team 1 Player 1'];
              const t1p2 = match['Team 1 Player 2'];
              const t2p1 = match['Team 2 Player 1'];
              const t2p2 = match['Team 2 Player 2'];
              const t1Score = match['Team 1 Score'];
              const t2Score = match['Team 2 Score'];
              const isTeam1Winner = match.Winner === 'Team 1';
              const isTeam2Winner = match.Winner === 'Team 2';
              const team1Class = isTeam1Winner ? 'clipboard-winner' : 'clipboard-loser';
              const team2Class = isTeam2Winner ? 'clipboard-winner' : 'clipboard-loser';

              return (
                <tr key={match.id || idx}>
                  <td>{idx + 1}</td>
                  <td className={team1Class}>
                    <div className="player-cell">
                      <span className="player-name clickable" onClick={() => t1p1 && onPlayerClick(t1p1)}>
                        {t1p1}
                      </span>
                      {t1p2 && (
                        <span className="player-name clickable" onClick={() => onPlayerClick(t1p2)}>
                          {t1p2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`score-cell ${team1Class}`}>{t1Score}</td>
                  <td className={`score-cell clipboard-col-score-team2 ${team2Class}`}>{t2Score}</td>
                  <td className={`clipboard-col-team2 ${team2Class}`}>
                    <div className="player-cell">
                      <span className="player-name clickable" onClick={() => t2p1 && onPlayerClick(t2p1)}>
                        {t2p1}
                      </span>
                      {t2p2 && (
                        <span className="player-name clickable" onClick={() => onPlayerClick(t2p2)}>
                          {t2p2}
                        </span>
                      )}
                    </div>
                  </td>
                  {showActions && (
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="icon-button small"
                        onClick={() => onEditMatch(match)}
                        aria-label="Edit match"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
        {canAddMatch && onAddMatch && (
          <tfoot>
            <tr>
              <td colSpan={colSpan}>
                <button type="button" className="add-row-button" onClick={() => onAddMatch(sessionId, seasonId)}>
                  + Add Match
                </button>
              </td>
            </tr>
          </tfoot>
        )}
        {lastUpdated && !canAddMatch && (
          <tfoot>
            <tr>
              <td colSpan={colSpan} className="table-footer-meta">
                <div
                  className="session-timestamp"
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.8rem',
                    color: 'var(--gray-500)',
                    textAlign: 'right',
                  }}
                >
                  {formatRelativeTime(lastUpdated)}
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
