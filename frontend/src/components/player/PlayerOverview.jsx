import { Trophy, Target, TrendingUp } from 'lucide-react';

export default function PlayerOverview({ overview }) {
  if (!overview || !overview.ranking) {
    return null;
  }

  return (
    <div className="player-overview">
      <div className="overview-stat">
        <Trophy size={24} className="overview-icon" />
        <div className="overview-content">
          <div className="overview-label">Ranking</div>
          <div className="overview-value">#{overview.ranking}</div>
        </div>
      </div>
      <div className="overview-stat">
        <Target size={24} className="overview-icon" />
        <div className="overview-content">
          <div className="overview-label">Points</div>
          <div className="overview-value">{overview.points}</div>
        </div>
      </div>
      <div className="overview-stat">
        <TrendingUp size={24} className="overview-icon" />
        <div className="overview-content">
          <div className="overview-label">Rating</div>
          <div className="overview-value">{overview.rating}</div>
        </div>
      </div>
    </div>
  );
}

