import { Edit2 } from 'lucide-react';
import ShareInviteIcon from '../player/ShareInviteIcon';
import './SessionMatchesClipboardTable.css';

/**
 * Presentational clipboard table for session matches.
 * Winner names and scores use primary-dark; loser names and scores use gray-800.
 */
interface SessionMatchesClipboardTableProps {
  matches: any[];
  onPlayerClick: (playerId: any, playerName: string, e: React.MouseEvent) => void;
  onEditMatch?: (match: any) => void;
  canAddMatch?: boolean;
  onAddMatch?: (sessionId: any, seasonId: any) => void;
  sessionId?: any;
  seasonId?: any;
  showActions?: boolean;
  lastUpdated?: string | null;
  formatRelativeTime?: (date: string) => string;
}

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
}: SessionMatchesClipboardTableProps) {
  const colSpan = showActions ? 7 : 6;

  return (
    <div className="clipboard-table-wrapper">
      <table className="clipboard-table">
        <colgroup>
          <col className="clipboard-col-id" />
          <col className="clipboard-col-team" />
          <col className="clipboard-col-score" />
          <col className="clipboard-col-score" />
          <col className="clipboard-col-team" />
          <col className="clipboard-col-badge" />
          {showActions && <col />}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Team 1</th>
            <th colSpan={2} className="clipboard-score-header">Score</th>
            <th className="clipboard-col-team2">Team 2</th>
            <th aria-hidden="true" />
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
              const t1p1 = match.team_1_player_1;
              const t1p2 = match.team_1_player_2;
              const t2p1 = match.team_2_player_1;
              const t2p2 = match.team_2_player_2;
              const t1p1Id = match.team_1_player_1_id;
              const t1p2Id = match.team_1_player_2_id;
              const t2p1Id = match.team_2_player_1_id;
              const t2p2Id = match.team_2_player_2_id;
              const t1Score = match.team_1_score;
              const t2Score = match.team_2_score;
              const isTeam1Winner = match.Winner === 'Team 1';
              const isTeam2Winner = match.Winner === 'Team 2';
              const team1Class = isTeam1Winner ? 'clipboard-winner' : 'clipboard-loser';
              const team2Class = isTeam2Winner ? 'clipboard-winner' : 'clipboard-loser';

              return (
                <tr key={match.id || idx}>
                  <td>{idx + 1}</td>
                  <td className={team1Class}>
                    <div className="player-cell">
                      <span className="player-cell__entry">
                        <span className="player-name clickable" onClick={(e) => t1p1 && onPlayerClick(t1p1Id, t1p1, e)}>
                          {t1p1}
                        </span>
                        {match.team_1_player_1_is_placeholder && <ShareInviteIcon playerId={t1p1Id} playerName={t1p1} />}
                      </span>
                      {t1p2 && (
                        <span className="player-cell__entry">
                          <span className="player-name clickable" onClick={(e) => onPlayerClick(t1p2Id, t1p2, e)}>
                            {t1p2}
                          </span>
                          {match.team_1_player_2_is_placeholder && <ShareInviteIcon playerId={t1p2Id} playerName={t1p2} />}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`score-cell ${team1Class}`}>{t1Score}</td>
                  <td className={`score-cell clipboard-col-score-team2 ${team2Class}`}>{t2Score}</td>
                  <td className={`clipboard-col-team2 ${team2Class}`}>
                    <div className="player-cell">
                      <span className="player-cell__entry">
                        <span className="player-name clickable" onClick={(e) => t2p1 && onPlayerClick(t2p1Id, t2p1, e)}>
                          {t2p1}
                        </span>
                        {match.team_2_player_1_is_placeholder && <ShareInviteIcon playerId={t2p1Id} playerName={t2p1} />}
                      </span>
                      {t2p2 && (
                        <span className="player-cell__entry">
                          <span className="player-name clickable" onClick={(e) => onPlayerClick(t2p2Id, t2p2, e)}>
                            {t2p2}
                          </span>
                          {match.team_2_player_2_is_placeholder && <ShareInviteIcon playerId={t2p2Id} playerName={t2p2} />}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="clipboard-badge-cell">
                    {match.is_ranked ? (
                      <span className="clipboard-ranked-badge clipboard-ranked-badge--ranked">Ranked</span>
                    ) : match.ranked_intent ? (
                      <span
                        className="clipboard-ranked-badge clipboard-ranked-badge--pending"
                        data-tooltip="Will become ranked when all players register"
                      >
                        Pending
                      </span>
                    ) : (
                      <span className="clipboard-ranked-badge clipboard-ranked-badge--unranked">Unranked</span>
                    )}
                  </td>
                  {showActions && (
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="icon-button small"
                        onClick={() => onEditMatch?.(match)}
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
