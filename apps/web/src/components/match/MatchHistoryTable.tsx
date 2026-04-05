import { History } from 'lucide-react';

interface MatchHistoryTableProps {
  matchHistory: any[];
  onPlayerChange: (playerIdOrName: any) => void;
}

export default function MatchHistoryTable({ matchHistory, onPlayerChange }: MatchHistoryTableProps) {
  if (!matchHistory || matchHistory.length === 0) {
    return null;
  }

  const formatNewRating = (eloAfter: number | null | undefined, eloChange: number | null | undefined) => {
    if (!eloAfter && eloAfter !== 0) return null;
    if (!eloChange) {
      return <span>{Math.round(eloAfter)}</span>;
    }
    const changeStr = eloChange >= 0 ? `+${Math.round(eloChange)}` : `${Math.round(eloChange)}`;
    const className = eloChange >= 0 ? 'rating-positive' : 'rating-negative';
    return (
      <span>
        {Math.round(eloAfter)} <span className={className}>({changeStr})</span>
      </span>
    );
  };

  return (
    <>
      <h3><History size={22} />Match History</h3>

      {/* Desktop: standard table */}
      <div className="match-history-desktop">
        <div className="table-scroll-wrapper">
          <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Partner</th>
              <th>Opponents</th>
              <th>Result</th>
              <th>Score</th>
              <th>New Rating</th>
            </tr>
          </thead>
          <tbody>
            {matchHistory.map((match, idx) => {
              const ratingDisplay = formatNewRating(match.elo_after, match.elo_change);
              const sessionStatus = match.session_status;
              const isActiveSession = sessionStatus === 'ACTIVE';
              let rowClass = '';
              if (isActiveSession) {
                rowClass = 'active-session-row';
              } else if (idx % 2 !== 0) {
                rowClass = 'row-gray';
              }

              return (
                <tr key={idx} className={rowClass}>
                  <td>
                    {match.date}
                    {isActiveSession && (
                      <span className="active-session-badge-small"> Pending</span>
                    )}
                  </td>
                  <td>
                    <span className="player-name-modern" onClick={() => onPlayerChange(match.partner_id ?? match.partner)}>
                      {match.partner}
                    </span>
                  </td>
                  <td>
                    <span className="player-name-modern" onClick={() => onPlayerChange(match.opponent_1_id ?? match.opponent_1)}>
                      {match.opponent_1}
                    </span>
                    {' / '}
                    <span className="player-name-modern" onClick={() => onPlayerChange(match.opponent_2_id ?? match.opponent_2)}>
                      {match.opponent_2}
                    </span>
                  </td>
                  <td>
                    <strong className={match.result === 'W' ? 'result-win' : 'result-loss'}>
                      {match.result}
                    </strong>
                  </td>
                  <td>{match.score}</td>
                  <td>
                    {isActiveSession ? (
                      <span className="pending-text">Pending</span>
                    ) : (
                      ratingDisplay
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile: card layout */}
      <div className="match-history-mobile">
        {matchHistory.map((match, idx) => {
          const ratingDisplay = formatNewRating(match.elo_after, match.elo_change);
          const isActiveSession = match.session_status === 'ACTIVE';

          return (
            <div key={idx} className={`mh-card${isActiveSession ? ' mh-card--active' : ''}`}>
              <div className="mh-card__header">
                <span className="mh-card__date">{match.date}</span>
              </div>
              <div className="mh-card__body">
                <div className="mh-card__row">
                  <span className="mh-card__label">Partner</span>
                  <span
                    className="player-name-modern"
                    onClick={() => onPlayerChange(match.partner_id ?? match.partner)}
                  >
                    {match.partner}
                  </span>
                </div>
                <div className="mh-card__row">
                  <span className="mh-card__label">vs.</span>
                  <span>
                    <span
                      className="player-name-modern"
                      onClick={() => onPlayerChange(match.opponent_1_id ?? match.opponent_1)}
                    >
                      {match.opponent_1}
                    </span>
                    {' / '}
                    <span
                      className="player-name-modern"
                      onClick={() => onPlayerChange(match.opponent_2_id ?? match.opponent_2)}
                    >
                      {match.opponent_2}
                    </span>
                  </span>
                </div>
              </div>
              <div className="mh-card__footer">
                <strong className={match.result === 'W' ? 'result-win' : 'result-loss'}>
                  {match.result}
                </strong>
                <span className="mh-card__score">{match.score}</span>
                <span className="mh-card__rating">
                  {ratingDisplay ?? <span className="pending-text">Pending</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
