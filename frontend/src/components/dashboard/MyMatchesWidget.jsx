import { useState } from 'react';
import { Calendar, Trophy } from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';

export default function MyMatchesWidget({ matches, currentUserPlayer }) {
  const [showAll, setShowAll] = useState(false);
  if (!matches || matches.length === 0) {
    return (
      <div className="dashboard-widget">
        <div className="dashboard-widget-header">
          <Calendar size={20} />
          <h3 className="dashboard-widget-title">My Games</h3>
        </div>
        <div className="dashboard-widget-content">
          <div className="dashboard-empty-state">
            <Trophy size={40} className="empty-state-icon" />
            <p>No games found</p>
            <p className="empty-state-text">
              Your recent games will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getMatchResult = (match) => {
    // Match data format from API:
    // { Result: 'W'/'L'/'T', Partner: 'name', 'Opponent 1': 'name', 'Opponent 2': 'name', Score: '21-15' }
    
    const won = match.Result === 'W';
    const score = match.Score || '0-0';
    const partner = match.Partner || 'Solo';
    
    const opponents = [match['Opponent 1'], match['Opponent 2']].filter(Boolean);
    const opponent = opponents.length > 0 ? opponents.join(' & ') : 'Unknown';
    
    return {
      won,
      score,
      partner,
      opponent
    };
  };

  return (
    <div className="dashboard-widget">
      <div className="dashboard-widget-header">
        <Calendar size={20} />
        <h3 className="dashboard-widget-title">My Games</h3>
      </div>
      <div className="dashboard-widget-content">
        <div className={`dashboard-matches-list ${showAll ? 'dashboard-matches-list-expanded' : ''}`}>
          {(showAll ? matches : matches.slice(0, 5)).map((match, idx) => {
            const result = getMatchResult(match);
            
            return (
              <div key={idx} className="dashboard-match-item">
                <div className="dashboard-match-result">
                  <span className={`dashboard-match-status ${result.won ? 'won' : 'lost'}`}>
                    {match.Result || '?'}
                  </span>
                  <div className="dashboard-match-details">
                    <span className="dashboard-match-score">{result.score}</span>
                    <span className="dashboard-match-partner">w/ {result.partner}</span>
                    <span className="dashboard-match-opponent">vs {result.opponent}</span>
                  </div>
                </div>
                {match.Date && (
                  <span className="dashboard-match-date">
                    {formatDate(match.Date)}
                  </span>
                )}
              </div>
            );
          })}
          {matches.length > 5 && (
            <div 
              className="dashboard-widget-footer dashboard-widget-footer-clickable"
              onClick={() => setShowAll(!showAll)}
            >
              <p className="secondary-text">
                {showAll 
                  ? 'Show less' 
                  : `+${matches.length - 5} more game${matches.length - 5 !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

