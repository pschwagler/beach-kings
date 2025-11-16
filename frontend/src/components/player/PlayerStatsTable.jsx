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
      <table>
        <thead>
          <tr>
            <th>Partner/Opponent</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Win Rate</th>
            <th>Points</th>
            <th>Games</th>
            <th>Avg Pt Diff</th>
          </tr>
        </thead>
        <tbody>
          {playerStats.map((row, idx) => {
            const isSectionHeader = 
              row['Partner/Opponent'] === 'WITH PARTNERS' || 
              row['Partner/Opponent'] === 'VS OPPONENTS';
            const isEmpty = row['Partner/Opponent'] === '';
            const isOverall = row['Partner/Opponent'] === 'OVERALL';

            if (isEmpty) {
              return <tr key={idx}><td colSpan="7" className="spacer-row"></td></tr>;
            } else if (isSectionHeader) {
              return (
                <tr key={idx} className="section-header">
                  <td colSpan="7">{row['Partner/Opponent']}</td>
                </tr>
              );
            } else {
              return (
                <tr key={idx} className={isOverall ? 'section-header' : ''}>
                  <td>
                    {isOverall ? (
                      <strong>{row['Partner/Opponent']}</strong>
                    ) : (
                      <strong>
                        <span className="player-name" onClick={() => onPlayerChange(row['Partner/Opponent'])}>
                          {row['Partner/Opponent']}
                        </span>
                      </strong>
                    )}
                  </td>
                  <td>{row['Wins']}</td>
                  <td>{row['Losses']}</td>
                  <td>{formatWinRate(row['Win Rate'])}</td>
                  <td>{row['Points']}</td>
                  <td>{row['Games']}</td>
                  <td>{formatPtDiff(row['Avg Pt Diff'])}</td>
                </tr>
              );
            }
          })}
        </tbody>
      </table>
    </>
  );
}

