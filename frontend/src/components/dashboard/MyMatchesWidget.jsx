import { Calendar, Trophy } from 'lucide-react';
import { formatDate, formatTime } from '../../utils/dateUtils';

export default function MyMatchesWidget({ matches, currentUserPlayer }) {
  if (!matches || matches.length === 0) {
    return (
      <div className="dashboard-widget">
        <div className="dashboard-widget-header">
          <Calendar size={20} />
          <h3 className="dashboard-widget-title">My Matches</h3>
        </div>
        <div className="dashboard-widget-content">
          <div className="dashboard-empty-state">
            <Trophy size={40} className="empty-state-icon" />
            <p>No matches found</p>
            <p className="empty-state-text">
              Your recent matches will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getMatchResult = (match, playerName) => {
    const isTeam1 = match['Team 1 Player 1'] === playerName || match['Team 1 Player 2'] === playerName;
    const isTeam2 = match['Team 2 Player 1'] === playerName || match['Team 2 Player 2'] === playerName;
    
    if (!isTeam1 && !isTeam2) return null;
    
    const won = (isTeam1 && match.Winner === 'Team 1') || (isTeam2 && match.Winner === 'Team 2');
    const team1Score = match['Team 1 Score'] || 0;
    const team2Score = match['Team 2 Score'] || 0;
    
    return {
      won,
      score: isTeam1 ? `${team1Score}-${team2Score}` : `${team2Score}-${team1Score}`,
      opponent: isTeam1 
        ? [match['Team 2 Player 1'], match['Team 2 Player 2']].filter(Boolean).join(' & ')
        : [match['Team 1 Player 1'], match['Team 1 Player 2']].filter(Boolean).join(' & ')
    };
  };

  const playerName = currentUserPlayer?.full_name || currentUserPlayer?.nickname;

  return (
    <div className="dashboard-widget">
      <div className="dashboard-widget-header">
        <Calendar size={20} />
        <h3 className="dashboard-widget-title">My Matches</h3>
      </div>
      <div className="dashboard-widget-content">
        <div className="dashboard-matches-list">
          {matches.slice(0, 5).map((match, idx) => {
            const result = playerName ? getMatchResult(match, playerName) : null;
            
            return (
              <div key={idx} className="dashboard-match-item">
                {result ? (
                  <>
                    <div className="dashboard-match-result">
                      <span className={`dashboard-match-status ${result.won ? 'won' : 'lost'}`}>
                        {result.won ? 'W' : 'L'}
                      </span>
                      <div className="dashboard-match-details">
                        <span className="dashboard-match-score">{result.score}</span>
                        <span className="dashboard-match-opponent">vs {result.opponent}</span>
                      </div>
                    </div>
                    {match.Date && (
                      <span className="dashboard-match-date">
                        {formatDate(match.Date)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="dashboard-match-result">
                      <span className="dashboard-match-score">
                        {match['Team 1 Score'] || 0} - {match['Team 2 Score'] || 0}
                      </span>
                    </div>
                    {match.Date && (
                      <span className="dashboard-match-date">
                        {formatDate(match.Date)}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {matches.length > 5 && (
            <div className="dashboard-widget-footer">
              <p className="secondary-text">
                +{matches.length - 5} more match{matches.length - 5 !== 1 ? 'es' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

