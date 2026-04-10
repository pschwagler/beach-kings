'use client';

import { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import type { Player, MatchRecord } from '../../types';
import { Loader2, TrendingUp, Trophy, Target, Percent, Flame, Diff } from 'lucide-react';
import StatCard from '../ui/StatCard';

const RatingChart = lazy(() => import('./RatingChart'));
import PlayerTrophies from '../player/PlayerTrophies';
import { getPlayerStats, getPlayerMatchHistory } from '../../services/api';

/** Shape of global player stats returned by getPlayerStats. */
interface GlobalStats {
  current_elo?: number | null;
  [key: string]: unknown;
}

/** API field names from match history response (snake_case). */
const F = {
  SESSION_STATUS: 'session_status',
  ELO_AFTER: 'elo_after',
  ELO_BEFORE: 'elo_before',
  PARTNER: 'partner',
  PARTNER_ID: 'partner_id',
  OPPONENT_1: 'opponent_1',
  OPPONENT_1_ID: 'opponent_1_id',
  OPPONENT_2: 'opponent_2',
  OPPONENT_2_ID: 'opponent_2_id',
  RESULT: 'result',
  SCORE: 'score',
  DATE: 'date',
  IS_RANKED: 'is_ranked',
  LEAGUE_ID: 'league_id',
  LEAGUE_NAME: 'league_name',
  SEASON_ID: 'season_id',
  SEASON_NAME: 'season_name',
};

const TIME_RANGES = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All Time', days: null },
];

/**
 * Filter matches through the full pipeline:
 * session status → time range → ranked → league/season → partner.
 */
function filterMatches(matches: MatchRecord[], timeRangeKey: string, rankedFilter: string, leagueSeasonFilter: string, partnerFilter: string): MatchRecord[] {
  let result = matches.filter(m => m[F.SESSION_STATUS] !== 'ACTIVE');

  // Time range
  if (timeRangeKey !== 'all') {
    const range = TIME_RANGES.find(r => r.key === timeRangeKey);
    if (range?.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - range.days);
      result = result.filter(m => m[F.DATE] && new Date(m[F.DATE] as string) >= cutoff);
    }
  }

  // Ranked filter
  if (rankedFilter === 'ranked') {
    result = result.filter(m => m[F.IS_RANKED]);
  }

  // League/season filter
  if (leagueSeasonFilter !== 'all') {
    if (leagueSeasonFilter.startsWith('season-')) {
      const seasonId = Number(leagueSeasonFilter.replace('season-', ''));
      result = result.filter(m => m[F.SEASON_ID] === seasonId);
    } else if (leagueSeasonFilter.startsWith('league-')) {
      const leagueId = Number(leagueSeasonFilter.replace('league-', ''));
      result = result.filter(m => m[F.LEAGUE_ID] === leagueId);
    }
  }

  // Partner filter
  if (partnerFilter !== 'all') {
    result = result.filter(m => m[F.PARTNER] === partnerFilter);
  }

  return result;
}

/**
 * Get matches from the previous equivalent time period (for delta comparison).
 * Returns null for "all" time range.
 */
function getPreviousPeriodMatches(allCompleted: MatchRecord[], timeRangeKey: string): MatchRecord[] | null {
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
    const d = new Date(m[F.DATE] as string);
    return d >= prevStart && d < periodStart;
  });
}

/**
 * Parse a score string like "21-15" into [playerScore, opponentScore].
 * Returns [0, 0] for malformed or missing scores.
 */
function parseScore(score: unknown): [number, number] {
  if (!score) return [0, 0];
  const match = String(score).match(/^(\d+)-(\d+)$/);
  if (!match) return [0, 0];
  return [Number(match[1]), Number(match[2])];
}

/**
 * Compute average point differential for a set of matches.
 */
function computeAvgDiff(matches: MatchRecord[]): number | null {
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
function computeOverview(filtered: MatchRecord[], currentElo: number | null | undefined) {
  const games = filtered.length;
  const wins = filtered.filter(m => m[F.RESULT] === 'W').length;
  const losses = games - wins;
  const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : null;

  // Peak ELO in range
  let peak: number | null = null;
  for (const m of filtered) {
    const eloAfter = m[F.ELO_AFTER];
    if (typeof eloAfter === 'number') {
      if (peak === null || eloAfter > peak) peak = eloAfter;
    }
  }

  const avgDiff = computeAvgDiff(filtered);

  // Current streak (walk from newest match in filtered set)
  let streak = '';
  if (filtered.length > 0) {
    const sorted = [...filtered].sort((a, b) => {
      const da = a[F.DATE] ? new Date(a[F.DATE] as string).getTime() : 0;
      const db = b[F.DATE] ? new Date(b[F.DATE] as string).getTime() : 0;
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
function computeDeltas(allCompleted: MatchRecord[], filtered: MatchRecord[], timeRangeKey: string, currentElo: number | null | undefined) {
  if (allCompleted.length === 0 || currentElo == null) return {};

  // Sort once, oldest-first, for reuse below
  const sortedAsc = [...allCompleted]
    .filter(m => m[F.ELO_AFTER] != null && m[F.DATE])
    .sort((a, b) => new Date(a[F.DATE] as string).getTime() - new Date(b[F.DATE] as string).getTime());

  if (sortedAsc.length === 0) return {};

  // --- Rating delta: always computed ---
  let ratingDelta = null;

  if (timeRangeKey === 'all') {
    // Compare current to very first recorded ELO
    ratingDelta = currentElo - (sortedAsc[0][F.ELO_AFTER] as number);
  } else {
    const range = TIME_RANGES.find(r => r.key === timeRangeKey);
    if (!range?.days) return {};

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - range.days);

    // Prefer: last ELO before the period start
    const beforePeriod = sortedAsc
      .filter(m => new Date(m[F.DATE] as string) < periodStart);

    if (beforePeriod.length > 0) {
      ratingDelta = currentElo - (beforePeriod[beforePeriod.length - 1][F.ELO_AFTER] as number);
    } else {
      // No matches before period — fall back to earliest ELO ever
      ratingDelta = currentElo - (sortedAsc[0][F.ELO_AFTER] as number);
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
function formatDelta(value: number | null | undefined, suffix = '', decimals = 0): { label: string; direction: 'up' | 'down' | 'neutral' } | undefined {
  if (value == null || !isFinite(value)) return undefined;
  // Round very small deltas to zero
  if (Math.abs(value) < 0.05) return undefined;

  const formatted = Math.abs(value) < 10 && decimals > 0
    ? value.toFixed(decimals)
    : String(Math.round(value));
  const direction: 'up' | 'down' | 'neutral' = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  const sign = value > 0 ? '+' : '';
  return { label: `${sign}${formatted}${suffix}`, direction };
}

/**
 * Group matches by player ID to build partnership/opponent tables.
 * Includes average point differential per player.
 *
 * @param {Array} matches - Filtered match array
 * @param {Function} extractor - Returns [{id, name}] pairs from a match
 */
interface PlayerEntry {
  name: string | null;
  games: number;
  wins: number;
  totalDiff: number;
  diffCount: number;
}

function groupByPlayer(
  matches: MatchRecord[],
  extractor: (m: MatchRecord) => Array<{ id: number | string | null; name: string | null }>
) {
  const map: Record<string, PlayerEntry> = {};
  for (const m of matches) {
    const players = extractor(m).filter(p => p.id != null);
    for (const { id, name } of players) {
      const key = String(id);
      if (!map[key]) map[key] = { name, games: 0, wins: 0, totalDiff: 0, diffCount: 0 };
      // Keep the latest name seen for this ID (handles renames)
      if (name) map[key].name = name;
      map[key].games++;
      if (m[F.RESULT] === 'W') map[key].wins++;
      const [ps, os] = parseScore(m[F.SCORE]);
      if (ps || os) {
        map[key].totalDiff += ps - os;
        map[key].diffCount++;
      }
    }
  }
  return Object.entries(map)
    .map(([id, s]) => ({
      id: Number(id),
      name: s.name,
      games: s.games,
      wins: s.wins,
      losses: s.games - s.wins,
      winRate: ((s.wins / s.games) * 100).toFixed(1),
      avgDiff: s.diffCount > 0 ? (s.totalDiff / s.diffCount).toFixed(1) : null,
    }))
    .sort((a, b) => b.games - a.games);
}

/**
 * Format avgDiff for display: "+3.2", "-1.5", or "\u2014" for null.
 */
function formatAvgDiff(avgDiff: string | null): string {
  if (avgDiff == null) return '\u2014';
  const n = Number(avgDiff);
  if (n > 0) return `+${avgDiff}`;
  return avgDiff;
}

/**
 * Get CSS modifier class for a +/- value.
 */
function diffClass(avgDiff: string | null): string {
  if (avgDiff == null) return '';
  const n = Number(avgDiff);
  if (n > 0) return 'my-stats-tab__diff--positive';
  if (n < 0) return 'my-stats-tab__diff--negative';
  return '';
}

/**
 * Build grouped league/season options from match data.
 * Returns { leagues: [{id, name}], seasons: [{id, name, leagueName, leagueId}] }.
 */
function buildLeagueSeasonOptions(allCompleted: MatchRecord[]) {
  const leagueMap = new Map();
  const seasonMap = new Map();

  for (const m of allCompleted) {
    const leagueId = m[F.LEAGUE_ID];
    const leagueName = m[F.LEAGUE_NAME];
    const seasonId = m[F.SEASON_ID];
    const seasonName = m[F.SEASON_NAME];

    if (leagueId && leagueName && !leagueMap.has(leagueId)) {
      leagueMap.set(leagueId, leagueName);
    }
    if (seasonId && seasonName && !seasonMap.has(seasonId)) {
      seasonMap.set(seasonId, { name: seasonName, leagueName: leagueName || '', leagueId });
    }
  }

  const leagues = [...leagueMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seasons = [...seasonMap.entries()]
    .map(([id, s]) => ({ id, name: s.name, leagueName: s.leagueName, leagueId: s.leagueId }))
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName) || a.name.localeCompare(b.name));

  return { leagues, seasons };
}

/**
 * Build unique partner names sorted by total games played (descending).
 */
function buildPartnerOptions(allCompleted: MatchRecord[]): string[] {
  const counts: Record<string, number> = {};
  for (const m of allCompleted) {
    const name = m[F.PARTNER];
    if (typeof name === 'string') counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/**
 * MyStatsTab — Full stats breakdown with time range filtering,
 * ranked/league/partner filters, and combined partners/opponents table.
 *
 * @param {Object} currentUserPlayer - Current authenticated player
 */
interface MyStatsTabProps {
  currentUserPlayer: Player | null;
}

export default function MyStatsTab({ currentUserPlayer }: MyStatsTabProps) {
  const [timeRange, setTimeRange] = useState('all');
  const [rankedFilter, setRankedFilter] = useState('all');
  const [leagueSeasonFilter, setLeagueSeasonFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [tableView, setTableView] = useState('partners');
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          const sorted = ((matchRes.value || []) as MatchRecord[]).sort((a, b) => {
            const da = a[F.DATE] ? new Date(a[F.DATE] as string).getTime() : 0;
            const db = b[F.DATE] ? new Date(b[F.DATE] as string).getTime() : 0;
            return db - da;
          });
          setMatchHistory(sorted);
        }
      } catch (err: unknown) {
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

  // Filter options derived from match data
  const { leagues, seasons } = useMemo(
    () => buildLeagueSeasonOptions(allCompleted),
    [allCompleted]
  );
  const partnerOptions = useMemo(
    () => buildPartnerOptions(allCompleted),
    [allCompleted]
  );

  // Filtered matches through full pipeline
  const filtered = useMemo(
    () => filterMatches(matchHistory, timeRange, rankedFilter, leagueSeasonFilter, partnerFilter),
    [matchHistory, timeRange, rankedFilter, leagueSeasonFilter, partnerFilter]
  );

  // Overview stats
  const currentElo = (globalStats?.current_elo ?? (matchHistory.length > 0 ? matchHistory[0]?.[F.ELO_AFTER] : null)) as number | null | undefined;
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
      const da = a[F.DATE] ? new Date(a[F.DATE] as string).getTime() : 0;
      const db = b[F.DATE] ? new Date(b[F.DATE] as string).getTime() : 0;
      return da - db;
    });

    // Aggregate per day: end-of-day rating, max rating, game count, first ELO of day
    const byDate = new Map();
    for (const m of sorted) {
      const existing = byDate.get(m[F.DATE]);
      if (existing) {
        existing.rating = m[F.ELO_AFTER]; // last match wins (end-of-day)
        existing.maxRating = Math.max(existing.maxRating, m[F.ELO_AFTER] as number);
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
    () => groupByPlayer(filtered, m => [
      { id: m[F.PARTNER_ID] as string | number, name: m[F.PARTNER] as string },
    ]),
    [filtered]
  );

  // Opponents table
  const opponents = useMemo(
    () => groupByPlayer(filtered, m => [
      { id: m[F.OPPONENT_1_ID] as string | number, name: m[F.OPPONENT_1] as string },
      { id: m[F.OPPONENT_2_ID] as string | number, name: m[F.OPPONENT_2] as string },
    ]),
    [filtered]
  );

  // Show all toggle — reset when filters or view change
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
  }, [timeRange, rankedFilter, leagueSeasonFilter, partnerFilter, tableView]);

  // Active table data based on view toggle
  const activeData = tableView === 'partners' ? partnerships : opponents;
  const displayed = showAll ? activeData : activeData.slice(0, 10);

  // Check if any filter is active (for showing active indicator)
  const hasActiveFilters = rankedFilter !== 'all' || leagueSeasonFilter !== 'all' || partnerFilter !== 'all';

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

  return (
    <div className="my-stats-tab">
      <h2 className="my-stats-tab__title">My Stats</h2>

      {/* Trophies — compact badges, renders nothing if no awards */}
      {currentUserPlayer?.id && <PlayerTrophies playerId={currentUserPlayer.id} compact />}

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

      {/* Filter Row */}
      <div className="my-stats-tab__filter-row">
        {/* Ranked Toggle */}
        <div className="my-stats-tab__filter-toggle">
          <button
            className={`my-stats-tab__filter-toggle-btn${rankedFilter === 'all' ? ' my-stats-tab__filter-toggle-btn--active' : ''}`}
            onClick={() => setRankedFilter('all')}
            type="button"
          >
            All
          </button>
          <button
            className={`my-stats-tab__filter-toggle-btn${rankedFilter === 'ranked' ? ' my-stats-tab__filter-toggle-btn--active' : ''}`}
            onClick={() => setRankedFilter('ranked')}
            type="button"
          >
            Ranked
          </button>
        </div>

        {/* League / Season Dropdown */}
        {leagues.length > 0 && (
          <select
            className="my-stats-tab__filter-select"
            value={leagueSeasonFilter}
            onChange={e => setLeagueSeasonFilter(e.target.value)}
          >
            <option value="all">All Leagues</option>
            {leagues.map(league => {
              const leagueSeasons = seasons.filter(s => s.leagueId === league.id);
              return (
                <optgroup key={league.id} label={league.name}>
                  <option value={`league-${league.id}`}>{league.name} (all seasons)</option>
                  {leagueSeasons.map(s => (
                    <option key={s.id} value={`season-${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}

        {/* Partner Dropdown */}
        {partnerOptions.length > 0 && (
          <select
            className="my-stats-tab__filter-select"
            value={partnerFilter}
            onChange={e => setPartnerFilter(e.target.value)}
          >
            <option value="all">All Partners</option>
            {partnerOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            className="my-stats-tab__filter-clear"
            onClick={() => {
              setRankedFilter('all');
              setLeagueSeasonFilter('all');
              setPartnerFilter('all');
            }}
            type="button"
          >
            Clear
          </button>
        )}
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
            value={overview.peak != null ? Math.round(overview.peak as number).toLocaleString() : '\u2014'}
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
          <Suspense fallback={null}>
            <RatingChart data={chartData} />
          </Suspense>
        </div>
      </section>

      {/* Combined Partners / Opponents Table */}
      <section className="my-stats-tab__section">
        <div className="my-stats-tab__table-header">
          <div className="my-stats-tab__table-toggle">
            <button
              className={`my-stats-tab__table-toggle-btn${tableView === 'partners' ? ' my-stats-tab__table-toggle-btn--active' : ''}`}
              onClick={() => setTableView('partners')}
              type="button"
            >
              Partners
            </button>
            <button
              className={`my-stats-tab__table-toggle-btn${tableView === 'opponents' ? ' my-stats-tab__table-toggle-btn--active' : ''}`}
              onClick={() => setTableView('opponents')}
              type="button"
            >
              Opponents
            </button>
          </div>
        </div>
        {activeData.length === 0 ? (
          <p className="my-stats-tab__table-empty">
            {filtered.length === 0
              ? 'No games for current filters'
              : `Play more games to see ${tableView === 'partners' ? 'partnership' : 'opponent'} stats`}
          </p>
        ) : (
          <>
            <table className="my-stats-tab__stats-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Games</th>
                  <th>W-L</th>
                  <th>Win %</th>
                  <th>+/-</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(p => (
                  <tr key={p.id}>
                    <td className="my-stats-tab__player-name">{p.name}</td>
                    <td>{p.games}</td>
                    <td>{p.wins}-{p.losses}</td>
                    <td>{p.winRate}</td>
                    <td className={diffClass(p.avgDiff)}>{formatAvgDiff(p.avgDiff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeData.length > 10 && (
              <button
                className="my-stats-tab__show-all-btn"
                onClick={() => setShowAll(prev => !prev)}
                type="button"
              >
                {showAll ? 'Show less' : `Show all (${activeData.length})`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
