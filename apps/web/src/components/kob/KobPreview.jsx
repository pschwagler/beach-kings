"use client";

import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import "./KobPreview.css";

/** Map 1-based placeholder IDs to letters: 1→A, 2→B, ..., 26→Z, 27→AA */
function playerLabel(id) {
  if (id <= 0) return "?";
  let label = "";
  let n = id;
  while (n > 0) {
    n--;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

/** Format minutes as "Xh Ym" */
function formatTime(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format minutes as clock-style "H:MM", e.g. 0 → "0:00", 90 → "1:30" */
function formatClock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Compact inline match cell: two player circles, "v", two player circles */
function MatchCell({ match }) {
  if (!match) {
    return <span className="kob-preview__empty-cell">&ndash;</span>;
  }
  return (
    <span className="kob-preview__match-cell">
      <span className="kob-preview__team">
        {match.team1.map((pid, i) => (
          <span key={`t1-${pid}-${i}`} className="kob-preview__player">
            {playerLabel(pid)}
          </span>
        ))}
      </span>
      <span className="kob-preview__vs">v</span>
      <span className="kob-preview__team">
        {match.team2.map((pid, i) => (
          <span key={`t2-${pid}-${i}`} className="kob-preview__player">
            {playerLabel(pid)}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Build wave-rows for a non-pool round.
 * If a round has more matches than courts, split into waves.
 * Returns array of { matches: Match[] } per wave.
 */
/**
 * Non-pool table: columns = courts, rows = rounds (time slots).
 * Backend guarantees each round has ≤ num_courts matches,
 * so one row per round.
 */
function NonPoolTable({ rounds, numCourts, roundClocks }) {
  const courtNums = [];
  for (let c = 1; c <= numCourts; c++) courtNums.push(c);

  return (
    <div className="kob-preview__table-wrapper">
      <table className="kob-preview__table">
        <thead>
          <tr>
            <th className="kob-preview__th kob-preview__th--rd">Rd</th>
            {courtNums.map((c) => (
              <th key={c} className="kob-preview__th">Ct {c}</th>
            ))}
            <th className="kob-preview__th kob-preview__th--time">Time</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((rnd) => (
            <tr key={rnd.round_num} className="kob-preview__tr--round-start">
              <td className="kob-preview__td kob-preview__td--rd">{rnd.round_num}</td>
              {courtNums.map((courtNum, colIdx) => {
                const match = rnd.matches.find((m) => m.court_num === courtNum)
                  || rnd.matches[colIdx];
                return (
                  <td key={courtNum} className="kob-preview__td">
                    {colIdx < rnd.matches.length ? (
                      <MatchCell match={match} />
                    ) : (
                      <span className="kob-preview__empty-cell">&ndash;</span>
                    )}
                  </td>
                );
              })}
              <td className="kob-preview__td kob-preview__td--time">
                {roundClocks?.[rnd.round_num] != null
                  ? formatClock(roundClocks[rnd.round_num])
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pool play table: columns = pools (with court + game_to in header),
 * rows = time slots. Uneven pools → "–" for the pool with fewer matches.
 */
function PoolTable({ rounds, poolIds, poolCourts, poolGameTo, roundClocks }) {
  // Build rows: each round becomes a group of sub-rows.
  // For each round, find matches per pool, then zip them into rows.
  const rows = [];

  for (const rnd of rounds) {
    // Group matches by pool_id
    const matchesByPool = {};
    for (const pid of poolIds) matchesByPool[pid] = [];
    for (const m of rnd.matches) {
      const pid = m.pool_id;
      if (pid && matchesByPool[pid]) {
        matchesByPool[pid].push(m);
      }
    }

    // Max matches in any pool for this round
    const maxMatches = Math.max(
      ...poolIds.map((pid) => matchesByPool[pid].length),
      1
    );

    for (let i = 0; i < maxMatches; i++) {
      rows.push({
        roundNum: i === 0 ? rnd.round_num : null,
        time: i === 0 && roundClocks?.[rnd.round_num] != null
          ? formatClock(roundClocks[rnd.round_num])
          : null,
        cells: poolIds.map((pid) => matchesByPool[pid][i] || null),
      });
    }
  }

  return (
    <div className="kob-preview__table-wrapper">
      <table className="kob-preview__table">
        <thead>
          <tr>
            <th className="kob-preview__th kob-preview__th--rd">Rd</th>
            {poolIds.map((pid) => {
              const court = poolCourts?.[String(pid)];
              const gameTo = poolGameTo?.[String(pid)];
              const hasCustomGameTo = poolGameTo && new Set(Object.values(poolGameTo)).size > 1;
              return (
                <th
                  key={pid}
                  className={`kob-preview__th kob-preview__th--pool kob-preview__th--pool-${pid}`}
                >
                  <span className="kob-preview__pool-header-name">Pool {pid}</span>
                  {court && (
                    <span className="kob-preview__pool-header-detail">Ct {court}</span>
                  )}
                  {hasCustomGameTo && gameTo && (
                    <span className="kob-preview__pool-header-detail">to {gameTo}</span>
                  )}
                </th>
              );
            })}
            <th className="kob-preview__th kob-preview__th--time">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={row.roundNum ? "kob-preview__tr--round-start" : ""}
            >
              <td className="kob-preview__td kob-preview__td--rd">
                {row.roundNum ?? ""}
              </td>
              {row.cells.map((match, cellIdx) => (
                <td key={cellIdx} className="kob-preview__td">
                  <MatchCell match={match} />
                </td>
              ))}
              <td className="kob-preview__td kob-preview__td--time">
                {row.time ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Playoff display: RR playoffs use NonPoolTable, draft playoffs use a bracket list.
 */
function PlayoffSection({ rounds, numCourts, roundClocks }) {
  if (!rounds.length) return null;

  // Check if this is a draft bracket (has bracket_position)
  const isDraft = rounds.some((r) => r.bracket_position);

  if (isDraft) {
    /** Render a draft bracket match: "#3 + pick  v  #6 + pick" */
    const DraftMatch = ({ match }) => {
      const seed = (team) => team.find((p) => p > 0);
      const s1 = seed(match.team1);
      const s2 = seed(match.team2);
      // Top 4 final: 1st picks, remaining 2 auto-paired
      if (s1 && !s2) {
        return (
          <span className="kob-preview__match-cell">
            <span className="kob-preview__team">
              <span className="kob-preview__player">#{s1}</span>
              <span className="kob-preview__draft-pick">+ pick</span>
            </span>
            <span className="kob-preview__vs">v</span>
            <span className="kob-preview__draft-pick">remaining 2</span>
          </span>
        );
      }
      return (
        <span className="kob-preview__match-cell">
          <span className="kob-preview__team">
            <span className="kob-preview__player">#{s1 || "?"}</span>
            <span className="kob-preview__draft-pick">+ pick</span>
          </span>
          <span className="kob-preview__vs">v</span>
          <span className="kob-preview__team">
            <span className="kob-preview__player">#{s2 || "?"}</span>
            <span className="kob-preview__draft-pick">+ pick</span>
          </span>
        </span>
      );
    };

    return (
      <div className="kob-preview__bracket">
        {rounds.map((rnd) => (
          <div key={rnd.round_num} className="kob-preview__bracket-round">
            <div className="kob-preview__bracket-label">{rnd.label}</div>
            {rnd.matches.map((m) => (
              <div key={m.matchup_id} className="kob-preview__bracket-match">
                <DraftMatch match={m} />
              </div>
            ))}
            <div className="kob-preview__bracket-time">
              {roundClocks?.[rnd.round_num] != null
                ? formatClock(roundClocks[rnd.round_num])
                : `${rnd.time_minutes}m`}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // RR playoffs — same table format as non-pool
  return <NonPoolTable rounds={rounds} numCourts={numCourts} roundClocks={roundClocks} />;
}

export default function KobPreview({ recommendation, loading }) {
  const preview_rounds = recommendation?.preview_rounds;

  // Derive numCourts from matches
  const numCourts = useMemo(() => {
    if (!preview_rounds) return 1;
    let maxCourt = 1;
    for (const rnd of preview_rounds) {
      for (const m of rnd.matches) {
        if (m.court_num > maxCourt) maxCourt = m.court_num;
      }
    }
    return maxCourt;
  }, [preview_rounds]);

  // Separate pool play and playoff rounds
  const poolPlayRounds = useMemo(
    () => (preview_rounds || []).filter((r) => r.phase === "pool_play"),
    [preview_rounds]
  );
  const playoffRounds = useMemo(
    () => (preview_rounds || []).filter((r) => r.phase === "playoffs"),
    [preview_rounds]
  );

  // Build cumulative clock: round_num → elapsed minutes at start of that round
  const roundClocks = useMemo(() => {
    if (!preview_rounds) return {};
    const clocks = {};
    let elapsed = 0;
    for (const rnd of preview_rounds) {
      clocks[rnd.round_num] = elapsed;
      elapsed += rnd.time_minutes || 0;
    }
    return clocks;
  }, [preview_rounds]);

  if (loading) {
    return (
      <div className="kob-preview__loading">
        <Loader2 size={16} className="spin" style={{ color: "var(--primary)" }} />
        <span>Generating preview...</span>
      </div>
    );
  }

  if (!recommendation) {
    return <div className="kob-preview__empty">Set at least 4 players to see a preview.</div>;
  }

  const {
    total_time_minutes,
    min_games_per_player,
    max_games_per_player,
    games_per_court,
    playoff_rounds: playoffRoundCount,
    playoff_size,
    preview_pools,
    pool_game_to,
    pool_courts,
    playoff_format,
    explanation,
    suggestion,
  } = recommendation;

  const hasPlayoffs = playoffRounds.length > 0;
  const hasPools = preview_pools && Object.keys(preview_pools).length > 0;
  const poolIds = hasPools
    ? Object.keys(preview_pools).map(Number).sort((a, b) => a - b)
    : [];

  return (
    <div>
      {/* Warning — top of preview so it's always visible */}
      {suggestion && (
        <div className="kob-preview__warning">
          <AlertTriangle size={16} className="kob-preview__warning-icon" />
          <span>{suggestion}</span>
        </div>
      )}

      {/* Summary bar */}
      <div className="kob-preview__summary">
        <span className="kob-preview__stat">
          ~{formatTime(total_time_minutes)}
        </span>
        <span className="kob-preview__stat-divider">&middot;</span>
        <span className="kob-preview__stat">
          {min_games_per_player === max_games_per_player
            ? min_games_per_player
            : `${min_games_per_player}\u2013${max_games_per_player}`}
          {" "}<span className="kob-preview__stat-label">games/player</span>
        </span>
        <span className="kob-preview__stat-divider">&middot;</span>
        <span className="kob-preview__stat">
          {games_per_court} <span className="kob-preview__stat-label">games/court</span>
        </span>
        {hasPlayoffs && (
          <>
            <span className="kob-preview__stat-divider">&middot;</span>
            <span className="kob-preview__stat">
              + {playoffRoundCount} <span className="kob-preview__stat-label">playoff rds</span>
            </span>
          </>
        )}
      </div>

      {/* Schedule preview */}
      <div className="kob-preview__schedule">
        <div className="kob-preview__schedule-header">{explanation}</div>

        {/* Pool legend */}
        {hasPools && (
          <div className="kob-preview__pools">
            {poolIds.map((poolId) => (
              <span
                key={poolId}
                className={`kob-preview__pool-badge kob-preview__pool-badge--${poolId}`}
              >
                Pool {poolId}: {preview_pools[String(poolId)].map((pid) => playerLabel(pid)).join(", ")}
              </span>
            ))}
          </div>
        )}

        {/* Pool play table */}
        {hasPools ? (
          <PoolTable
            rounds={poolPlayRounds}
            poolIds={poolIds}
            poolCourts={pool_courts}
            poolGameTo={pool_game_to}
            roundClocks={roundClocks}
          />
        ) : (
          <NonPoolTable rounds={poolPlayRounds} numCourts={numCourts} roundClocks={roundClocks} />
        )}

        {/* Playoff divider + rounds */}
        {hasPlayoffs && (
          <>
            <div className="kob-preview__phase-divider">Playoffs</div>
            <PlayoffSection rounds={playoffRounds} numCourts={numCourts} roundClocks={roundClocks} />
          </>
        )}

        {/* End time */}
        <div className="kob-preview__finish">
          <span className="kob-preview__finish-clock">{formatClock(total_time_minutes)}</span>
          <span className="kob-preview__finish-label">
            {playoff_format === "DRAFT" ? "Champions crowned" : "Champion crowned"}
          </span>
          <span className="kob-preview__finish-medals">
            {playoff_format === "DRAFT" ? (
              <>
                🥇🥇 🥈🥈{playoff_size >= 6 ? " 🥉🥉" : ""}
              </>
            ) : (
              <>🥇 🥈 🥉</>
            )}
          </span>
        </div>
      </div>

    </div>
  );
}
