import { BarChart3 } from 'lucide-react';

export default function PlayerStatsTable({ playerStats, onPlayerChange }) {
  const formatPtDiff = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    return value >= 0 ? `+${value}` : `${value}`;
  };

  const formatWinRate = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    return `${(value * 100).toFixed(1)}%`;
  };

  if (!playerStats || playerStats.length === 0) {
    return null;
  }

  return (
    <>
      <h3><BarChart3 size={22} />Player Stats</h3>
      <div className="table-scroll-wrapper">
        <table className="player-stats-table">
        <thead>
          <tr>
            <th className="player-stats-name-col">Partner/Opponent</th>
            <th>
              <span className="th-content">
                <span className="desktop-label">Wins</span>
                <span className="mobile-label">W</span>
              </span>
            </th>
            <th>
              <span className="th-content">
                <span className="desktop-label">Losses</span>
                <span className="mobile-label">L</span>
              </span>
            </th>
            <th>
              <span className="th-content">
                <span className="desktop-label">Win %</span>
                <span className="mobile-label">WIN %</span>
              </span>
            </th>
            <th>
              <span className="th-content">
                <span className="desktop-label">Games</span>
                <span className="mobile-label">GP</span>
              </span>
            </th>
            <th>
              <span className="th-content">
                <span className="desktop-label">Avg +/-</span>
                <span className="mobile-label">AVG +/-</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {playerStats.reduce((acc, row, idx) => {
            const isSectionHeader = 
              row['Partner/Opponent'] === 'WITH PARTNERS' || 
              row['Partner/Opponent'] === 'VS OPPONENTS';
            const isEmpty = row['Partner/Opponent'] === '';
            const isOverall = row['Partner/Opponent'] === 'OVERALL';

            // Reset counter on section header
            if (isSectionHeader) {
              acc.groupRowIndex = 0;
            }

            let className = '';
            if (isOverall) {
              className = 'overall-row';
            } else if (!isEmpty && !isSectionHeader) {
              // Increment counter for data rows
              if (acc.groupRowIndex % 2 !== 0) {
                className = 'row-gray';
              }
              acc.groupRowIndex++;
            }

            if (isEmpty) {
              acc.rows.push(<tr key={idx}><td colSpan="6" className="spacer-row"></td></tr>);
            } else if (isSectionHeader) {
              acc.rows.push(
                <tr key={idx} className="section-header">
                  <td colSpan="6" style={{ width: '100%' }}>{row['Partner/Opponent']}</td>
                </tr>
              );
            } else {
              acc.rows.push(
                <tr key={idx} className={className}>
                  <td className="player-stats-name-col">
                    {isOverall ? (
                      <strong>{row['Partner/Opponent']}</strong>
                    ) : (
                      <strong>
                        <span className="player-name-modern" onClick={() => onPlayerChange(row['Partner/Opponent'])}>
                          {row['Partner/Opponent']}
                        </span>
                      </strong>
                    )}
                  </td>
                  <td className="player-stats-stat-cell">{row['Wins']}</td>
                  <td className="player-stats-stat-cell">{row['Losses']}</td>
                  <td className="player-stats-stat-cell">{formatWinRate(row['Win Rate'])}</td>
                  <td className="player-stats-stat-cell">{row['Games']}</td>
                  <td className="player-stats-stat-cell">{formatPtDiff(row['Avg Pt Diff'])}</td>
                </tr>
              );
            }
            return acc;
          }, { rows: [], groupRowIndex: 0 }).rows}
        </tbody>
      </table>
      </div>
    </>
  );
}

