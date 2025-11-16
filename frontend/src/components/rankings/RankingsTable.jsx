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
    <table>
      <thead>
        <tr>
          <th className="sticky-col" onClick={() => handleSort('Name')}>
            <Tooltip text="Player's name">
              Name{getSortArrow('Name')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Points')}>
            <Tooltip text="Season points: +3 for each win, +1 for each loss">
              Points{getSortArrow('Points')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('ELO')}>
            <Tooltip text="Current skill rating (higher is better)">
              Rating{getSortArrow('ELO')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Games')}>
            <Tooltip text="Total number of games played this season">
              Games{getSortArrow('Games')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Win Rate')}>
            <Tooltip text="Percentage of games won">
              Win Rate{getSortArrow('Win Rate')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Wins')}>
            <Tooltip text="Total number of wins">
              Wins{getSortArrow('Wins')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Losses')}>
            <Tooltip text="Total number of losses">
              Losses{getSortArrow('Losses')}
            </Tooltip>
          </th>
          <th onClick={() => handleSort('Avg Pt Diff')}>
            <Tooltip text="Average point differential per game">
              Avg Pt Diff{getSortArrow('Avg Pt Diff')}
            </Tooltip>
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedRankings.map((player, idx) => (
          <tr key={idx}>
            <td className="sticky-col">
              <span className="player-name" onClick={() => onPlayerClick(player.Name)}>
                {player.Name}
                {firstPlacePlayer && player.Name === firstPlacePlayer.Name && (
                  <Crown size={16} className="crown-icon" />
                )}
              </span>
            </td>
            <td>{player.Points}</td>
            <td>{player.ELO}</td>
            <td>{player.Games}</td>
            <td>{(player['Win Rate'] * 100).toFixed(1)}%</td>
            <td>{player.Wins}</td>
            <td>{player.Losses}</td>
            <td>{formatPtDiff(player['Avg Pt Diff'])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

