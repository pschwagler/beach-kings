"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import "./KobLive.css";

export default function StandingsTab({ standings, pools, players, status }) {
  const [selectedPool, setSelectedPool] = useState(null);

  const hasPools = pools && Object.keys(pools).length > 0;

  // Filter standings by pool if selected
  const filtered = selectedPool
    ? standings?.filter((s) => s.pool_id === selectedPool)
    : standings;

  return (
    <div className="kob-standings">
      {/* Pool tabs */}
      {hasPools && (
        <div className="kob-standings__pool-tabs">
          <button
            type="button"
            className={`kob-standings__pool-tab ${!selectedPool ? "kob-standings__pool-tab--active" : ""}`}
            onClick={() => setSelectedPool(null)}
          >
            All
          </button>
          {Object.keys(pools).map((poolId) => (
            <button
              key={poolId}
              type="button"
              className={`kob-standings__pool-tab ${selectedPool === parseInt(poolId) ? "kob-standings__pool-tab--active" : ""}`}
              onClick={() => setSelectedPool(parseInt(poolId))}
            >
              Pool {poolId}
            </button>
          ))}
        </div>
      )}

      {/* Standings table */}
      {filtered && filtered.length > 0 ? (
        <>
          <div className="kob-standings__table-wrapper">
            <table className="kob-standings__table">
              <thead>
                <tr>
                  <th className="kob-standings__th kob-standings__th--rank">#</th>
                  <th className="kob-standings__th kob-standings__th--name">Player</th>
                  <th className="kob-standings__th kob-standings__th--stat">W</th>
                  <th className="kob-standings__th kob-standings__th--stat">L</th>
                  <th className="kob-standings__th kob-standings__th--stat">PF</th>
                  <th className="kob-standings__th kob-standings__th--stat">PA</th>
                  <th className="kob-standings__th kob-standings__th--stat">+/-</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, idx) => (
                  <tr
                    key={entry.player_id}
                    className={`kob-standings__row ${status === "COMPLETED" && entry.rank <= 3 ? "kob-standings__row--podium" : ""}`}
                  >
                    <td className="kob-standings__td kob-standings__td--rank">
                      {status === "COMPLETED" && entry.rank === 1 ? (
                        <Trophy size={16} style={{ color: "var(--sun-gold)" }} />
                      ) : (
                        entry.rank
                      )}
                    </td>
                    <td className="kob-standings__td kob-standings__td--name">
                      {entry.player_name || `Player ${entry.player_id}`}
                    </td>
                    <td className="kob-standings__td kob-standings__td--stat kob-standings__td--wins">
                      {entry.wins}
                    </td>
                    <td className="kob-standings__td kob-standings__td--stat">
                      {entry.losses}
                    </td>
                    <td className="kob-standings__td kob-standings__td--stat">
                      {entry.points_for}
                    </td>
                    <td className="kob-standings__td kob-standings__td--stat">
                      {entry.points_against}
                    </td>
                    <td className={`kob-standings__td kob-standings__td--stat ${entry.point_diff > 0 ? "kob-standings__td--positive" : entry.point_diff < 0 ? "kob-standings__td--negative" : ""}`}>
                      {entry.point_diff > 0 ? "+" : ""}{entry.point_diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="kob-standings__tiebreaker-note">
            Tiebreakers: Wins &gt; Point Diff. Ties broken by coin flip.
          </p>
        </>
      ) : (
        <div className="kob-standings__empty">
          <p>No scores recorded yet.</p>
        </div>
      )}
    </div>
  );
}
