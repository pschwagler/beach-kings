import { Trophy, Target, TrendingUp, Swords, BarChart3 } from 'lucide-react';

export default function PlayerOverview({ overview, isSeason = true }) {
  // For league stats (All Seasons), show games and win% instead of ranking and points
  // Ranking and points only apply to seasons
  if (!overview) {
    return null;
  }

  // Check if we have the required data for the view type
  if (isSeason && !overview.ranking) {
    return null;
  }
  if (!isSeason && overview.games === undefined) {
    return null;
  }

  const formatWinRate = (winRate) => {
    if (winRate === null || winRate === undefined) return 'N/A';
    return `${(winRate * 100).toFixed(1)}%`;
  };

  return (
    <div className="player-overview">
      {isSeason ? (
        // Season view: show ranking and points
        <>
          <div className="overview-stat">
            <Trophy size={32} className="overview-icon" />
            <div className="overview-content">
              <div className="overview-label">Ranking</div>
              <div className="overview-value">#{overview.ranking}</div>
            </div>
          </div>
          <div className="overview-stat">
            <Target size={32} className="overview-icon" />
            <div className="overview-content">
              <div className="overview-label">Points</div>
              <div className="overview-value">{overview.points}</div>
            </div>
          </div>
        </>
      ) : (
        // League view (All Seasons): show games and win%
        <>
          <div className="overview-stat">
            <Swords size={32} className="overview-icon" />
            <div className="overview-content">
              <div className="overview-label">Games</div>
              <div className="overview-value">{overview.games || 0}</div>
            </div>
          </div>
          <div className="overview-stat">
            <BarChart3 size={32} className="overview-icon" />
            <div className="overview-content">
              <div className="overview-label">Win %</div>
              <div className="overview-value">{formatWinRate(overview.win_rate)}</div>
            </div>
          </div>
        </>
      )}
      <div className="overview-stat">
        <TrendingUp size={32} className="overview-icon" />
        <div className="overview-content">
          <div className="overview-label">Rating</div>
          <div className="overview-value">{overview.rating}</div>
        </div>
      </div>
    </div>
  );
}

