import { useState } from 'react';
import { Crown } from 'lucide-react';
import { Tooltip } from '../ui/UI';
import { getFirstPlacePlayer, sortPlayersDefault } from '../../utils/playerUtils';

export default function RankingsTable({ rankings, onPlayerClick, loading }) {
  const [sortConfig, setSortConfig] = useState({ column: 'Points', ascending: false });

  if (loading) {
    return <div className="loading">Loading rankings...</div>;
  }

  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : false
    }));
  };

  const getSortArrow = (column) => {
    if (sortConfig.column === column) {
      return sortConfig.ascending ? ' ↑' : ' ↓';
    }
    return '';
  };

  const sortedRankings = [...rankings].sort((a, b) => {
    // Primary sort by selected column
    const aVal = a[sortConfig.column];
    const bVal = b[sortConfig.column];
    
    const primaryComparison = aVal > bVal ? 1 : -1;
    const primaryResult = sortConfig.ascending ? primaryComparison : -primaryComparison;
    
    if (aVal !== bVal) return primaryResult;
    
    // Use default tiebreakers
    return sortPlayersDefault(a, b);
  });

  // Find first place player using utility function
  const firstPlacePlayer = getFirstPlacePlayer(rankings);

  const formatPtDiff = (value) => {
    return value >= 0 ? `+${value}` : `${value}`;
  };

  if (rankings.length === 0) {
    return <div className="loading">No rankings available yet. Click "Recalculate Stats" to load data.</div>;
  }

  return (
    <div className="rankings-table-wrapper">
      <table className="rankings-table-modern">
        <thead>
          <tr>
            <th className="sticky-col" onClick={() => handleSort('Name')}>
              <Tooltip text="Player's name">
                <span className="th-content">
                  Name{getSortArrow('Name')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Points')}>
              <Tooltip text="Season points: +3 for each win, +1 for each loss">
                <span className="th-content">
                  Points{getSortArrow('Points')}
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
            <th onClick={() => handleSort('Games')}>
              <Tooltip text="Total number of games played this season">
                <span className="th-content">
                  Games{getSortArrow('Games')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Win Rate')}>
              <Tooltip text="Percentage of games won">
                <span className="th-content">
                  Win Rate{getSortArrow('Win Rate')}
                </span>
              </Tooltip>
            </th>
            <th onClick={() => handleSort('Wins')}>
              <Tooltip text="Total number of wins">
                <span className="th-content">
                  Wins{getSortArrow('Wins')}
                </span>
              </Tooltip>
            </th>
            <th className="mobile-hide-col" onClick={() => handleSort('Losses')}>
              <Tooltip text="Total number of losses">
                <span className="th-content">
                  Losses{getSortArrow('Losses')}
                </span>
              </Tooltip>
            </th>
            <th className="mobile-hide-col" onClick={() => handleSort('Avg Pt Diff')}>
              <Tooltip text="Average point differential per game">
                <span className="th-content">
                  Avg Pt Diff{getSortArrow('Avg Pt Diff')}
                </span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRankings.map((player, idx) => (
            <tr key={player.player_id || idx} className="rankings-row">
              <td className="sticky-col rankings-name-cell">
                <span className="player-name-modern" onClick={() => onPlayerClick(player.player_id, player.Name)}>
                  {firstPlacePlayer && player.player_id === firstPlacePlayer.player_id && (
                    <Crown size={18} className="crown-icon-modern" />
                  )}
                  <span className="player-name-text">{player.Name}</span>
                </span>
              </td>
              <td className="rankings-stat-cell">{player.Points}</td>
              <td className="rankings-stat-cell">{Math.round(player.ELO)}</td>
              <td className="rankings-stat-cell">{player.Games}</td>
              <td className="rankings-stat-cell">{(player['Win Rate'] * 100).toFixed(1)}%</td>
              <td className="rankings-stat-cell">{player.Wins}</td>
              <td className="rankings-stat-cell mobile-hide-col">{player.Losses}</td>
              <td className="rankings-stat-cell mobile-hide-col">{formatPtDiff(player['Avg Pt Diff'])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

