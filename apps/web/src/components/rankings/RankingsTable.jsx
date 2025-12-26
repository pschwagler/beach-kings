import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Crown } from 'lucide-react';
import { Tooltip } from '../ui/UI';
import { getFirstPlacePlayer } from '../../utils/playerUtils';
import { RankingsTableSkeleton } from '../ui/Skeletons';

// Helper function to check if avatar is an image URL
const isImageUrl = (avatar) => {
  if (!avatar) return false;
  return avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/');
};

// Avatar component
const PlayerAvatar = ({ avatar, playerName }) => {
  if (isImageUrl(avatar)) {
    return (
      <div className="player-avatar player-avatar-image">
        <img src={avatar} alt={playerName} />
      </div>
    );
  }
  
  return (
    <div className="player-avatar player-avatar-initials">
      <span className="player-avatar-text">{avatar || '?'}</span>
    </div>
  );
};

export default function RankingsTable({ rankings, onPlayerClick, loading, isAllSeasons = false, onNavigateToMatches }) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Default sort by season_rank (ascending - 1, 2, 3...)
  const [sortConfig, setSortConfig] = useState({ column: 'season_rank', ascending: true });
  
  const handleNavigateToMatches = () => {
    if (onNavigateToMatches) {
      onNavigateToMatches();
    } else if (pathname && router) {
      // Navigate to matches tab by updating URL
      const url = new URL(pathname, window.location.origin);
      url.searchParams.set('tab', 'matches');
      router.push(url.pathname + url.search);
    } else if (typeof window !== 'undefined') {
      // Fallback: try to update the current URL
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('tab', 'matches');
      window.location.href = currentUrl.toString();
    }
  };

  // All hooks must be called before any early returns
  const sortedRankings = useMemo(() => {
    // If rankings is null or undefined, data hasn't loaded yet
    if (!rankings || !Array.isArray(rankings) || rankings.length === 0) return [];
    
    return [...rankings].sort((a, b) => {
      // Primary sort by selected column
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      const primaryComparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      const primaryResult = sortConfig.ascending ? primaryComparison : -primaryComparison;
      
      if (primaryResult !== 0) return primaryResult;
      
      // Tiebreaker: if sorting by something other than season_rank, use season_rank as tiebreaker
      if (sortConfig.column !== 'season_rank') {
        const aRank = a.season_rank || 9999;
        const bRank = b.season_rank || 9999;
        return aRank - bRank; // Always ascending for rank
      }
      
      return 0;
    });
  }, [rankings, sortConfig]);

  // Find first place player using utility function
  const firstPlacePlayer = useMemo(() => getFirstPlacePlayer(rankings), [rankings]);

  // Early returns after all hooks
  // Show skeleton if loading OR if rankings hasn't loaded yet (null or undefined)
  if (loading || rankings === null || rankings === undefined) {
    return <RankingsTableSkeleton />;
  }

  const handleSort = (column) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        // Toggle ascending/descending for same column
        return { column, ascending: !prev.ascending };
      } else {
        // New column: default to ascending for season_rank, descending for others
        return { column, ascending: column === 'season_rank' };
      }
    });
  };

  const getSortArrow = (column) => {
    if (sortConfig.column === column) {
      return sortConfig.ascending ? ' ↑' : ' ↓';
    }
    return '';
  };

  const formatPtDiff = (value) => {
    return value >= 0 ? `+${value}` : `${value}`;
  };

  // Only show empty state if rankings is explicitly an empty array (loaded but empty)
  // Don't show if rankings is null/undefined (not loaded yet)
  if (Array.isArray(rankings) && rankings.length === 0) {
    return (
      <div className="loading">
        No rankings available yet.{' '}
        <button
          onClick={handleNavigateToMatches}
          className="link-button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
          }}
        >
          Add Games
        </button>
        {' '}to start tracking stats.
      </div>
    );
  }

  return (
    <div className="rankings-table-wrapper">
      <table className="rankings-table-modern">
        <thead>
          <tr>
            <th className="rank-number-header" onClick={() => handleSort('season_rank')}>
              <span className="th-content">
                <span className="desktop-label">No</span>
                <span className="mobile-label">No</span>
                {getSortArrow('season_rank')}
              </span>
            </th>
            <th className="sticky-col" onClick={() => handleSort('Name')}>
              <Tooltip text="Player's name">
                <span className="th-content">
                  Player name{getSortArrow('Name')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Points')}>
              <Tooltip text="Season points: +3 for each win, +1 for each loss">
                <span className="th-content">
                  <span className="desktop-label">Points</span>
                  <span className="mobile-label">PTS</span>
                  {getSortArrow('Points')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Games')}>
              <Tooltip text="Total number of games played this season">
                <span className="th-content">
                  <span className="desktop-label">Games</span>
                  <span className="mobile-label">GP</span>
                  {getSortArrow('Games')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Wins')}>
              <Tooltip text="Total number of wins">
                <span className="th-content">
                  <span className="desktop-label">Wins</span>
                  <span className="mobile-label">W</span>
                  {getSortArrow('Wins')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Losses')}>
              <Tooltip text="Total number of losses">
                <span className="th-content">
                  <span className="desktop-label">Losses</span>
                  <span className="mobile-label">L</span>
                  {getSortArrow('Losses')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Win Rate')}>
              <Tooltip text="Percentage of games won">
                <span className="th-content">
                  Win %{getSortArrow('Win Rate')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Avg Pt Diff')}>
              <Tooltip text="Average point differential per game">
                <span className="th-content">
                  Avg +/-{getSortArrow('Avg Pt Diff')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('ELO')}>
              <Tooltip text="Current skill rating (higher is better)">
                <span className="th-content">
                  Rating{getSortArrow('ELO')}
                </span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRankings.map((player, idx) => {
            return (
              <tr 
                key={player.player_id || idx} 
                className="rankings-row clickable-row"
                onClick={() => onPlayerClick(player.player_id, player.Name)}
              >
                <td className="rank-number-cell">{isAllSeasons ? '-' : (player.season_rank || idx + 1)}</td>
                <td className="sticky-col rankings-name-cell">
                  <span className="player-name-modern">
                    <PlayerAvatar avatar={player.avatar} playerName={player.Name} />
                    {firstPlacePlayer && player.player_id === firstPlacePlayer.player_id && (
                      <Crown size={15} className="crown-icon-modern" />
                    )}
                    <span>{player.Name}</span>
                  </span>
                </td>
                <td className="rankings-stat-cell">{isAllSeasons ? '-' : player.Points}</td>
                <td className="rankings-stat-cell">{player.Games}</td>
                <td className="rankings-stat-cell">{player.Wins}</td>
                <td className="rankings-stat-cell">{player.Losses}</td>
                <td className="rankings-stat-cell">{(player['Win Rate'] * 100).toFixed(1)}%</td>
                <td className="rankings-stat-cell">{formatPtDiff(player['Avg Pt Diff'])}</td>
                <td className="rankings-stat-cell">{Math.round(player.ELO)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

