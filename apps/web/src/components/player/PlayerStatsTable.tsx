import React from 'react';
import { BarChart3 } from 'lucide-react';

export interface PlayerStatsRow {
  partner_opponent: string;
  player_id?: number | null;
  wins?: number | string;
  losses?: number | string;
  win_rate?: number | null;
  games?: number | string;
  avg_pt_diff?: number | string | null;
}

interface PlayerStatsTableProps {
  playerStats: PlayerStatsRow[] | null;
  onPlayerChange: (id: number | string) => void;
}

export default function PlayerStatsTable({ playerStats, onPlayerChange }: PlayerStatsTableProps) {
  const formatPtDiff = (value: number | string | null | undefined): string => {
    if (value === '' || value === null || value === undefined) return '';
    return Number(value) >= 0 ? `+${value}` : `${value}`;
  };

  const formatWinRate = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    return `${(value * 100).toFixed(1)}%`;
  };

  if (!playerStats || playerStats.length === 0) {
    return null;
  }

  const renderRows = (colSpan: number, isMobile: boolean): React.ReactNode[] => {
    return playerStats.reduce((acc: { rows: React.ReactNode[]; groupRowIndex: number }, row, idx) => {
      const isSectionHeader =
        row.partner_opponent === 'WITH PARTNERS' ||
        row.partner_opponent === 'VS OPPONENTS';
      const isEmpty = row.partner_opponent === '';
      const isOverall = row.partner_opponent === 'OVERALL';

      let groupRowIndex = isSectionHeader ? 0 : acc.groupRowIndex;

      let className = '';
      if (isOverall) {
        className = 'overall-row';
      } else if (!isEmpty && !isSectionHeader) {
        if (groupRowIndex % 2 !== 0) {
          className = 'row-gray';
        }
        groupRowIndex++;
      }

      const rowKey = row.player_id != null ? `${row.player_id}-${idx}` : idx;
      const prefix = isMobile ? 'm-' : '';

      if (isEmpty) {
        acc.rows.push(<tr key={`${prefix}spacer-${idx}`}><td colSpan={colSpan} className="spacer-row"></td></tr>);
      } else if (isSectionHeader) {
        acc.rows.push(
          <tr key={`${prefix}header-${idx}`} className="section-header">
            <td colSpan={colSpan} style={{ width: '100%' }}>{row.partner_opponent}</td>
          </tr>
        );
      } else {
        const nameCell = (
          <td className={isMobile ? 'pst-mobile__name-col' : 'player-stats-name-col'}>
            {isOverall ? (
              <strong>{row.partner_opponent}</strong>
            ) : (
              <strong>
                <span className="player-name-modern" onClick={() => onPlayerChange(row.player_id ?? row.partner_opponent)}>
                  {row.partner_opponent}
                </span>
              </strong>
            )}
          </td>
        );

        if (isMobile) {
          acc.rows.push(
            <tr key={`${prefix}${rowKey}`} className={className}>
              {nameCell}
              <td className="pst-mobile__stat-col">{row.wins}-{row.losses}</td>
              <td className="pst-mobile__stat-col">{formatWinRate(row.win_rate)}</td>
              <td className="pst-mobile__stat-col">{formatPtDiff(row.avg_pt_diff)}</td>
            </tr>
          );
        } else {
          acc.rows.push(
            <tr key={`${prefix}${rowKey}`} className={className}>
              {nameCell}
              <td className="player-stats-stat-cell">{row.wins}</td>
              <td className="player-stats-stat-cell">{row.losses}</td>
              <td className="player-stats-stat-cell">{formatWinRate(row.win_rate)}</td>
              <td className="player-stats-stat-cell">{row.games}</td>
              <td className="player-stats-stat-cell">{formatPtDiff(row.avg_pt_diff)}</td>
            </tr>
          );
        }
      }
      return { rows: acc.rows, groupRowIndex };
    }, { rows: [], groupRowIndex: 0 }).rows;
  };

  return (
    <>
      <h3><BarChart3 size={22} />Player Stats</h3>

      {/* Desktop: 6-column table */}
      <div className="player-stats-desktop">
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
            {renderRows(6, false)}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile: 4-column compact table (W-L merged, no Games) */}
      <div className="player-stats-mobile">
        <table className="pst-mobile">
          <thead>
            <tr>
              <th className="pst-mobile__name-col">Name</th>
              <th className="pst-mobile__stat-col">W-L</th>
              <th className="pst-mobile__stat-col">Win%</th>
              <th className="pst-mobile__stat-col">+/-</th>
            </tr>
          </thead>
          <tbody>
            {renderRows(4, true)}
          </tbody>
        </table>
      </div>
    </>
  );
}
