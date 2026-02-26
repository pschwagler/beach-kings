'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, TrendingUp, Trophy, Target, Percent, Flame, Diff } from 'lucide-react';
import StatCard from '../ui/StatCard';
import RatingChart from './RatingChart';
import { getPlayerStats, getPlayerMatchHistory } from '../../services/api';

/** API field names from match history response. */
const F = {
  SESSION_STATUS: 'Session Status',
  ELO_AFTER: 'ELO After',
  ELO_BEFORE: 'ELO Before',
  PARTNER: 'Partner',
  OPPONENT_1: 'Opponent 1',
  OPPONENT_2: 'Opponent 2',
  RESULT: 'Result',
  SCORE: 'Score',
  DATE: 'Date',
};

const TIME_RANGES = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All Time', days: null },
];

/**
 * Filter matches to only completed (non-ACTIVE session) matches within a time range.
 */
function filterMatches(matches, timeRangeKey) {
  const completed = matches.filter(m => m[F.SESSION_STATUS] !== 'ACTIVE');
  if (timeRangeKey === 'all') return completed;

  const range = TIME_RANGES.find(r => r.key === timeRangeKey);
  if (!range?.days) return completed;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - range.days);

  return completed.filter(m => {
    if (!m[F.DATE]) return false;
    return new Date(m[F.DATE]) >= cutoff;
  });
}

/**
 * Get matches from the previous equivalent time period (for delta comparison).
 * Returns null for "all" time range.
 */
function getPreviousPeriodMatches(allCompleted, timeRangeKey) {
  if (timeRangeKey === 'all') return null;

  const range = TIME_RANGES.find(r => r.key === timeRangeKey);
  if (!range?.days) return null;

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - range.days);
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - range.days);

  return allCompleted.filter(m => {
    if (!m[F.DATE]) return false;
    const d = new Date(m[F.DATE]);
    return d >= prevStart && d < periodStart;
  });
}

/**
 * Parse a score string like "21-15" into [playerScore, opponentScore].
 * Returns [0, 0] for malformed or missing scores.
 */
function parseScore(score) {
  if (!score) return [0, 0];
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

/**
 * Compute average point differential for a set of matches.
 */
function computeAvgDiff(matches) {
  let total = 0;
  let count = 0;
  for (const m of matches) {
    const [ps, os] = parseScore(m[F.SCORE]);
    if (ps || os) {
      total += ps - os;
      count++;
    }
  }
  return count > 0 ? total / count : null;
}

/**
 * Compute overview stats from filtered matches.
 */
function computeOverview(filtered, currentElo) {
  const games = filtered.length;
  const wins = filtered.filter(m => m[F.RESULT] === 'W').length;
  const losses = games - wins;
  const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : null;

  // Peak ELO in range
  let peak = null;
  for (const m of filtered) {
    if (m[F.ELO_AFTER] != null) {
      if (peak === null || m[F.ELO_AFTER] > peak) peak = m[F.ELO_AFTER];
    }
  }

  const avgDiff = computeAvgDiff(filtered);

  // Current streak (walk from newest match in filtered set)
  let streak = '';
  if (filtered.length > 0) {
    const sorted = [...filtered].sort((a, b) => {
      const da = a[F.DATE] ? new Date(a[F.DATE]).getTime() : 0;
      const db = b[F.DATE] ? new Date(b[F.DATE]).getTime() : 0;
      return db - da;
    });
    const firstResult = sorted[0][F.RESULT];
    let count = 0;
    for (const m of sorted) {
      if (m[F.RESULT] === firstResult) count++;
      else break;
    }
    if (firstResult === 'W') streak = `W${count}`;
    else if (firstResult === 'L') streak = `L${count}`;
    else streak = `T${count}`;
  }

  return { wins, losses, winRate, peak, avgDiff, streak, rating: currentElo };
}

/**
 * Compute period-over-period deltas for stats that change over time.
 *
 * Rating delta always falls back to the earliest available ELO when the
 * previous period has no data (e.g. selecting "1y" when all games are
 * within the last 6 months).
 *
 * For "all" time, rating delta compares current ELO to the very first game.
 */
function computeDeltas(allCompleted, filtered, timeRangeKey, currentElo) {
  if (allCompleted.length === 0 || currentElo == null) return {};

  // Sort once, oldest-first, for reuse below
  const sortedAsc = [...allCompleted]
    .filter(m => m[F.ELO_AFTER] != null && m[F.DATE])
    .sort((a, b) => new Date(a[F.DATE]) - new Date(b[F.DATE]));

  if (sortedAsc.length === 0) return {};

  // --- Rating delta: always computed ---
  let ratingDelta = null;

  if (timeRangeKey === 'all') {
    // Compare current to very first recorded ELO
    ratingDelta = currentElo - sortedAsc[0][F.ELO_AFTER];
  } else {
    const range = TIME_RANGES.find(r => r.key === timeRangeKey);
    if (!range?.days) return {};

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - range.days);

    // Prefer: last ELO before the period start
    const beforePeriod = sortedAsc
      .filter(m => new Date(m[F.DATE]) < periodStart);

    if (beforePeriod.length > 0) {
      ratingDelta = currentElo - beforePeriod[beforePeriod.length - 1][F.ELO_AFTER];
    } else {
      // No matches before period — fall back to earliest ELO ever
      ratingDelta = currentElo - sortedAsc[0][F.ELO_AFTER];
    }
  }

  // --- Period-comparison deltas (only when previous period has data) ---
  let winRateDelta = null;
  let avgDiffDelta = null;

  if (timeRangeKey !== 'all') {
    const prevMatches = getPreviousPeriodMatches(allCompleted, timeRangeKey);

    if (prevMatches && prevMatches.length > 0 && filtered.length > 0) {
      // Win rate delta (percentage points)
      const curWR = (filtered.filter(m => m[F.RESULT] === 'W').length / filtered.length) * 100;
      const prevWR = (prevMatches.filter(m => m[F.RESULT] === 'W').length / prevMatches.length) * 100;
      winRateDelta = curWR - prevWR;

      // Avg +/- delta
      const curAvg = computeAvgDiff(filtered);
      const prevAvg = computeAvgDiff(prevMatches);
      if (curAvg != null && prevAvg != null) {
        avgDiffDelta = curAvg - prevAvg;
      }
    }
  }

  return { ratingDelta, winRateDelta, avgDiffDelta };
}

/**
 * Format a numeric delta into a display object for StatCard.
 * Returns null if value is null/undefined.
 *
 * @param {number|null} value - Raw delta value
 * @param {string} [suffix=''] - Suffix to append (e.g. '%')
 * @param {number} [decimals=0] - Decimal places for values < 10
 */
function formatDelta(value, suffix = '', decimals = 0) {
  if (value == null || !isFinite(value)) return null;
  // Round very small deltas to zero
  if (Math.abs(value) < 0.05) return null;

  const formatted = Math.abs(value) < 10 && decimals > 0
    ? value.toFixed(decimals)
    : String(Math.round(value));
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  const sign = value > 0 ? '+' : '';
  return { label: `${sign}${formatted}${suffix}`, direction };
}

/**
 * Group matches by a player name field to build partnership/opponent tables.
 *
 * NOTE: Keys are player display names. Players with identical names are merged.
 * Use player IDs as keys once the match history API includes them.
 */
function groupByPlayer(matches, nameExtractor) {
  const map = {};
  for (const m of matches) {
    const names = nameExtractor(m).filter(Boolean);
    for (const name of names) {
      if (!map[name]) map[name] = { games: 0, wins: 0 };
      map[name].games++;
      if (m[F.RESULT] === 'W') map[name].wins++;
    }
  }
  return Object.entries(map)
    .map(([name, s]) => ({
      name,
      games: s.games,
      wins: s.wins,
      losses: s.games - s.wins,
      winRate: ((s.wins / s.games) * 100).toFixed(1),
    }))
    .sort((a, b) => b.games - a.games);
}

/**
 * MyStatsTab — Full stats breakdown with time range filtering.
 *
 * @param {Object} currentUserPlayer - Current authenticated player
 */
export default function MyStatsTab({ currentUserPlayer }) {
  const [timeRange, setTimeRange] = useState('all');
  const [matchHistory, setMatchHistory] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch player stats + match history on mount
  useEffect(() => {
    if (!currentUserPlayer?.id) return;

    const controller = new AbortController();
    const { signal } = controller;
    const playerId = currentUserPlayer.id;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [statsRes, matchRes] = await Promise.allSettled([
          getPlayerStats(playerId, { signal }),
          getPlayerMatchHistory(playerId, { signal }),
        ]);

        if (signal.aborted) return;

        // Both calls rejected — show error
        if (statsRes.status === 'rejected' && matchRes.status === 'rejected') {
          setError('Failed to load stats. Please try again.');
          console.error('MyStatsTab stats error:', statsRes.reason);
          console.error('MyStatsTab match error:', matchRes.reason);
          return;
        }

        if (statsRes.status === 'fulfilled') setGlobalStats(statsRes.value);
        if (matchRes.status === 'fulfilled') {
          const sorted = (matchRes.value || []).sort((a, b) => {
            const da = a[F.DATE] ? new Date(a[F.DATE]).getTime() : 0;
            const db = b[F.DATE] ? new Date(b[F.DATE]).getTime() : 0;
            return db - da;
          });
          setMatchHistory(sorted);
        }
      } catch (err) {
        if (!signal.aborted) {
          setError('Failed to load stats. Please try again.');
          console.error('MyStatsTab load error:', err);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => { controller.abort(); };
  }, [currentUserPlayer?.id]);

  // All completed matches (used for filtering + deltas)
  const allCompleted = useMemo(
    () => matchHistory.filter(m => m[F.SESSION_STATUS] !== 'ACTIVE'),
    [matchHistory]
  );

  // Filtered matches based on time range
  const filtered = useMemo(
    () => filterMatches(matchHistory, timeRange),
    [matchHistory, timeRange]
  );

  // Overview stats
  const currentElo = globalStats?.current_elo ?? (matchHistory.length > 0 ? matchHistory[0]?.[F.ELO_AFTER] : null);
  const overview = useMemo(
    () => computeOverview(filtered, currentElo),
    [filtered, currentElo]
  );

  // Period-over-period deltas
  const deltas = useMemo(
    () => computeDeltas(allCompleted, filtered, timeRange, currentElo),
    [allCompleted, filtered, timeRange, currentElo]
  );

  // Chart data: one point per day (end-of-day rating), sorted oldest→newest
  const chartData = useMemo(() => {
    const completed = matchHistory.filter(
      m => m[F.SESSION_STATUS] !== 'ACTIVE' && m[F.ELO_AFTER] != null
    );
    // Sort oldest-first, then by match order (id implied by array position)
    const sorted = [...completed].sort((a, b) => {
      const da = a[F.DATE] ? new Date(a[F.DATE]).getTime() : 0;
      const db = b[F.DATE] ? new Date(b[F.DATE]).getTime() : 0;
      return da - db;
    });

    // Aggregate per day: end-of-day rating, max rating, game count, first ELO of day
    const byDate = new Map();
    for (const m of sorted) {
      const existing = byDate.get(m[F.DATE]);
      if (existing) {
        existing.rating = m[F.ELO_AFTER]; // last match wins (end-of-day)
        existing.maxRating = Math.max(existing.maxRating, m[F.ELO_AFTER]);
        existing.games += 1;
      } else {
        byDate.set(m[F.DATE], {
          date: m[F.DATE],
          rating: m[F.ELO_AFTER],
          firstRating: m[F.ELO_AFTER], // first match of the day
          maxRating: m[F.ELO_AFTER],
          games: 1,
        });
      }
    }

    // Compute per-day delta (end-of-day minus previous day's end-of-day)
    const entries = Array.from(byDate.values());
    let points = entries.map((pt, i) => {
      let dayDelta = null;
      if (i === 0) {
        // First day: delta is within-day change (end - first match start)
        dayDelta = pt.games > 1 ? pt.rating - pt.firstRating : null;
      } else {
        dayDelta = pt.rating - entries[i - 1].rating;
      }
      return { ...pt, dayDelta };
    });

    if (timeRange !== 'all') {
      const range = TIME_RANGES.find(r => r.key === timeRange);
      if (range?.days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - range.days);
        points = points.filter(p => new Date(p.date) >= cutoff);
      }
    }

    return points;
  }, [matchHistory, timeRange]);

  // Partnership table
  const partnerships = useMemo(
    () => groupByPlayer(filtered, m => [m[F.PARTNER]]),
    [filtered]
  );

  // Opponents table
  const opponents = useMemo(
    () => groupByPlayer(filtered, m => [m[F.OPPONENT_1], m[F.OPPONENT_2]]),
    [filtered]
  );

  // Show all toggles — reset when time range changes
  const [showAllPartners, setShowAllPartners] = useState(false);
  const [showAllOpponents, setShowAllOpponents] = useState(false);

  useEffect(() => {
    setShowAllPartners(false);
    setShowAllOpponents(false);
  }, [timeRange]);

  if (loading) {
    return (
      <div className="my-stats-tab">
        <div className="my-stats-tab__loading">
          <Loader2 size={32} className="spin" style={{ color: 'var(--primary)' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-stats-tab">
        <div className="my-stats-tab__error">{error}</div>
      </div>
    );
  }

  // Global empty state — no completed matches at all
  if (allCompleted.length === 0) {
    return (
      <div className="my-stats-tab">
        <h2 className="my-stats-tab__title">My Stats</h2>
        <div className="my-stats-tab__empty">
          <h3 className="my-stats-tab__empty-heading">No Stats Yet</h3>
          <p className="my-stats-tab__empty-desc">Play your first game to start tracking your stats!</p>
        </div>
      </div>
    );
  }

  const displayedPartners = showAllPartners ? partnerships : partnerships.slice(0, 10);
  const displayedOpponents = showAllOpponents ? opponents : opponents.slice(0, 10);

  return (
    <div className="my-stats-tab">
      <h2 className="my-stats-tab__title">My Stats</h2>

      {/* Time Range Filter */}
      <div className="my-stats-tab__time-filter">
        {TIME_RANGES.map(r => (
          <button
            key={r.key}
            className={`my-stats-tab__time-btn${timeRange === r.key ? ' my-stats-tab__time-btn--active' : ''}`}
            onClick={() => setTimeRange(r.key)}
            type="button"
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Overview Cards */}
      <section className="my-stats-tab__section">
        <div className="my-stats-tab__overview-grid">
          <StatCard
            icon={Trophy}
            label="Record"
            value={`${overview.wins}-${overview.losses}`}
          />
          <StatCard
            icon={TrendingUp}
            label="Rating"
            value={overview.rating != null ? Math.round(overview.rating).toLocaleString() : '\u2014'}
            delta={formatDelta(deltas.ratingDelta)}
          />
          <StatCard
            icon={Target}
            label="Peak Rating"
            value={overview.peak != null ? Math.round(overview.peak).toLocaleString() : '\u2014'}
          />
          <StatCard
            icon={Percent}
            label="Win Rate"
            value={overview.winRate != null ? `${overview.winRate}%` : '0%'}
            delta={formatDelta(deltas.winRateDelta, '%', 1)}
          />
          <StatCard
            icon={Diff}
            label="Avg +/-"
            value={overview.avgDiff != null ? (overview.avgDiff > 0 ? `+${Number(overview.avgDiff).toFixed(1)}` : Number(overview.avgDiff).toFixed(1)) : '\u2014'}
            delta={formatDelta(deltas.avgDiffDelta, '', 1)}
          />
          <StatCard
            icon={Flame}
            label="Streak"
            value={overview.streak || '\u2014'}
          />
        </div>
      </section>

      {/* Rating History Chart */}
      <section className="my-stats-tab__section">
        <h3 className="my-stats-tab__section-title">Rating History</h3>
        <div className="my-stats-tab__chart-wrapper">
          <RatingChart data={chartData} />
        </div>
      </section>

      {/* Partnerships Table */}
      <section className="my-stats-tab__section">
        <h3 className="my-stats-tab__section-title">Partnerships</h3>
        {partnerships.length === 0 ? (
          <p className="my-stats-tab__table-empty">Play more games to see partnership stats</p>
        ) : (
          <>
            <table className="my-stats-tab__stats-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Games</th>
                  <th>W-L</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                {displayedPartners.map(p => (
                  <tr key={p.name}>
                    <td className="my-stats-tab__player-name">{p.name}</td>
                    <td>{p.games}</td>
                    <td>{p.wins}-{p.losses}</td>
                    <td>{p.winRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partnerships.length > 10 && (
              <button
                className="my-stats-tab__show-all-btn"
                onClick={() => setShowAllPartners(prev => !prev)}
                type="button"
              >
                {showAllPartners ? 'Show less' : `Show all (${partnerships.length})`}
              </button>
            )}
          </>
        )}
      </section>

      {/* Opponents Table */}
      <section className="my-stats-tab__section">
        <h3 className="my-stats-tab__section-title">Opponents</h3>
        {opponents.length === 0 ? (
          <p className="my-stats-tab__table-empty">Play more games to see opponent stats</p>
        ) : (
          <>
            <table className="my-stats-tab__stats-table">
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th>Games</th>
                  <th>W-L</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                {displayedOpponents.map(p => (
                  <tr key={p.name}>
                    <td className="my-stats-tab__player-name">{p.name}</td>
                    <td>{p.games}</td>
                    <td>{p.wins}-{p.losses}</td>
                    <td>{p.winRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {opponents.length > 10 && (
              <button
                className="my-stats-tab__show-all-btn"
                onClick={() => setShowAllOpponents(prev => !prev)}
                type="button"
              >
                {showAllOpponents ? 'Show less' : `Show all (${opponents.length})`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
