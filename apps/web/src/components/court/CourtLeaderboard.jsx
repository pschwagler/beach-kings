'use client';

import { useState, useEffect } from 'react';
import { getCourtLeaderboard } from '../../services/api';
import { isImageUrl } from '../../utils/avatar';
import './CourtLeaderboard.css';

/**
 * Court leaderboard — shows top players by match count at this court.
 * Fetches data on mount; renders nothing if empty.
 */
export default function CourtLeaderboard({ slug }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    getCourtLeaderboard(slug)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading || entries.length === 0) return null;

  return (
    <div className="court-leaderboard">
      <h2 className="court-detail__section-title">Leaderboard</h2>
      <table className="court-leaderboard__table">
        <thead>
          <tr>
            <th className="court-leaderboard__th court-leaderboard__th--rank">#</th>
            <th className="court-leaderboard__th">Player</th>
            <th className="court-leaderboard__th court-leaderboard__th--num">Matches</th>
            <th className="court-leaderboard__th court-leaderboard__th--num">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.player_id} className="court-leaderboard__row">
              <td className="court-leaderboard__td court-leaderboard__td--rank">{entry.rank}</td>
              <td className="court-leaderboard__td">
                <a href={`/players/${entry.player_id}`} className="court-leaderboard__player">
                  <div className="court-leaderboard__avatar">
                    {isImageUrl(entry.avatar) ? (
                      <img src={entry.avatar} alt={entry.player_name} />
                    ) : (
                      entry.player_name?.charAt(0) || '?'
                    )}
                  </div>
                  <span className="court-leaderboard__player-name">{entry.player_name}</span>
                </a>
              </td>
              <td className="court-leaderboard__td court-leaderboard__td--num">{entry.match_count}</td>
              <td className="court-leaderboard__td court-leaderboard__td--num">
                {Math.round(entry.win_rate * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
