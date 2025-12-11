import { History } from 'lucide-react';

export default function MatchHistoryTable({ matchHistory, onPlayerChange }) {
  if (!matchHistory || matchHistory.length === 0) {
    return null;
  }

  const formatNewRating = (eloAfter, eloChange) => {
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
            const ratingDisplay = formatNewRating(match['ELO After'], match['ELO Change']);
            const sessionStatus = match['Session Status'];
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
                  {match.Date}
                  {isActiveSession && (
                    <span className="active-session-badge-small"> Pending</span>
                  )}
                </td>
                <td>
                  <span className="player-name-modern" onClick={() => onPlayerChange(match.Partner)}>
                    {match.Partner}
                  </span>
                </td>
                <td>
                  <span className="player-name-modern" onClick={() => onPlayerChange(match['Opponent 1'])}>
                    {match['Opponent 1']}
                  </span>
                  {' / '}
                  <span className="player-name-modern" onClick={() => onPlayerChange(match['Opponent 2'])}>
                    {match['Opponent 2']}
                  </span>
                </td>
                <td>
                  <strong className={match.Result === 'W' ? 'result-win' : 'result-loss'}>
                    {match.Result}
                  </strong>
                </td>
                <td>{match.Score}</td>
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
    </>
  );
}

