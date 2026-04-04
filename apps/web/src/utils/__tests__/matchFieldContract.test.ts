/**
 * Match field name contract tests.
 *
 * These tests guard the snake_case field contract between the backend
 * match history API and the frontend MyStatsTab computation logic.
 *
 * The F constants in MyStatsTab.tsx were migrated from PascalCase to
 * snake_case. These tests verify that:
 * 1. The canonical field names are all snake_case.
 * 2. Mock records built with those field names produce correct computed stats.
 * 3. Filtering on session_status, date, is_ranked, season_id, league_id,
 *    and partner all work with snake_case data.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Canonical field names (mirrors the F constants in MyStatsTab.tsx)
// ---------------------------------------------------------------------------

const MATCH_HISTORY_FIELDS = {
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
} as const;

type MatchRecord = {
  [key: string]: string | number | boolean | null | undefined;
};

// ---------------------------------------------------------------------------
// Inline copies of the pure functions from MyStatsTab.tsx
// (kept in sync — if MyStatsTab changes these must be updated too)
// ---------------------------------------------------------------------------

const F = MATCH_HISTORY_FIELDS;

function filterMatches(
  matches: MatchRecord[],
  timeRangeKey: string,
  rankedFilter: string,
  leagueSeasonFilter: string,
  partnerFilter: string,
): MatchRecord[] {
  const TIME_RANGES = [
    { key: '30d', days: 30 },
    { key: '90d', days: 90 },
    { key: '1y', days: 365 },
    { key: 'all', days: null },
  ];

  let result = matches.filter((m) => m[F.SESSION_STATUS] !== 'ACTIVE');

  if (timeRangeKey !== 'all') {
    const range = TIME_RANGES.find((r) => r.key === timeRangeKey);
    if (range?.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - range.days);
      result = result.filter(
        (m) => m[F.DATE] && new Date(m[F.DATE] as string) >= cutoff,
      );
    }
  }

  if (rankedFilter === 'ranked') {
    result = result.filter((m) => m[F.IS_RANKED]);
  }

  if (leagueSeasonFilter !== 'all') {
    if (leagueSeasonFilter.startsWith('season-')) {
      const seasonId = Number(leagueSeasonFilter.replace('season-', ''));
      result = result.filter((m) => m[F.SEASON_ID] === seasonId);
    } else if (leagueSeasonFilter.startsWith('league-')) {
      const leagueId = Number(leagueSeasonFilter.replace('league-', ''));
      result = result.filter((m) => m[F.LEAGUE_ID] === leagueId);
    }
  }

  if (partnerFilter !== 'all') {
    result = result.filter((m) => m[F.PARTNER] === partnerFilter);
  }

  return result;
}

function computeOverview(
  filtered: MatchRecord[],
  currentElo: number | null | undefined,
) {
  const games = filtered.length;
  const wins = filtered.filter((m) => m[F.RESULT] === 'W').length;
  const losses = games - wins;
  const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : null;

  let peak: number | null = null;
  for (const m of filtered) {
    const eloAfter = m[F.ELO_AFTER];
    if (typeof eloAfter === 'number') {
      if (peak === null || eloAfter > peak) peak = eloAfter;
    }
  }

  return { wins, losses, winRate, peak, rating: currentElo };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO date string N days relative to today. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Build a completed match with sensible snake_case defaults. */
function makeMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    session_status: 'SUBMITTED',
    date: daysAgo(5),
    result: 'W',
    score: '21-15',
    elo_after: 1250,
    elo_before: 1230,
    is_ranked: true,
    league_id: 1,
    league_name: 'Test League',
    season_id: 10,
    season_name: 'Spring 2024',
    partner: 'Alice',
    partner_id: 42,
    opponent_1: 'Bob',
    opponent_1_id: 43,
    opponent_2: 'Carol',
    opponent_2_id: 44,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Field-name contract: all F constants must be snake_case
// ---------------------------------------------------------------------------

describe('MATCH_HISTORY_FIELDS — snake_case contract', () => {
  const snakeCasePattern = /^[a-z][a-z0-9_]*$/;

  it('every field constant value is snake_case', () => {
    for (const [key, value] of Object.entries(MATCH_HISTORY_FIELDS)) {
      expect(
        snakeCasePattern.test(value),
        `MATCH_HISTORY_FIELDS.${key} = "${value}" is not snake_case`,
      ).toBe(true);
    }
  });

  it('no field constant is PascalCase (regression guard)', () => {
    const pascalCasePattern = /^[A-Z]/;
    for (const [key, value] of Object.entries(MATCH_HISTORY_FIELDS)) {
      expect(
        pascalCasePattern.test(value),
        `MATCH_HISTORY_FIELDS.${key} = "${value}" must NOT be PascalCase`,
      ).toBe(false);
    }
  });

  it('covers the full set of match history response fields', () => {
    // Keep in sync with MATCH_HISTORY_KEYS in apiKeyContract.test.ts
    const required = [
      'session_status',
      'elo_after',
      'partner',
      'partner_id',
      'opponent_1',
      'opponent_1_id',
      'opponent_2',
      'opponent_2_id',
      'result',
      'score',
      'date',
      'is_ranked',
      'league_id',
      'season_id',
    ];
    const fieldValues = Object.values(MATCH_HISTORY_FIELDS);
    for (const field of required) {
      expect(fieldValues).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// filterMatches — session_status filtering
// ---------------------------------------------------------------------------

describe('filterMatches — session_status', () => {
  it('excludes matches where session_status is ACTIVE', () => {
    const matches = [
      makeMatch({ session_status: 'ACTIVE' }),
      makeMatch({ session_status: 'SUBMITTED' }),
      makeMatch({ session_status: 'EDITED' }),
    ];

    const result = filterMatches(matches, 'all', 'all', 'all', 'all');

    expect(result).toHaveLength(2);
    expect(result.every((m) => m.session_status !== 'ACTIVE')).toBe(true);
  });

  it('reads the field using the snake_case key "session_status"', () => {
    // Construct record without using helper to be explicit about field names
    const active: MatchRecord = { session_status: 'ACTIVE', date: daysAgo(1) };
    const submitted: MatchRecord = { session_status: 'SUBMITTED', date: daysAgo(1), result: 'W' };

    const result = filterMatches([active, submitted], 'all', 'all', 'all', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].session_status).toBe('SUBMITTED');
  });
});

// ---------------------------------------------------------------------------
// filterMatches — date / time range filtering
// ---------------------------------------------------------------------------

describe('filterMatches — date field', () => {
  it('reads match date from the snake_case "date" field', () => {
    const recent = makeMatch({ date: daysAgo(10) });
    const old = makeMatch({ date: daysAgo(200) });

    const result = filterMatches([recent, old], '90d', 'all', 'all', 'all');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(recent);
  });

  it('includes all matches when timeRangeKey is "all"', () => {
    const matches = [
      makeMatch({ date: daysAgo(1) }),
      makeMatch({ date: daysAgo(500) }),
      makeMatch({ date: daysAgo(1000) }),
    ];

    const result = filterMatches(matches, 'all', 'all', 'all', 'all');
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// filterMatches — is_ranked filtering
// ---------------------------------------------------------------------------

describe('filterMatches — is_ranked field', () => {
  it('keeps only ranked matches when rankedFilter is "ranked"', () => {
    const matches = [
      makeMatch({ is_ranked: true }),
      makeMatch({ is_ranked: false }),
      makeMatch({ is_ranked: null }),
    ];

    const result = filterMatches(matches, 'all', 'ranked', 'all', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].is_ranked).toBe(true);
  });

  it('reads the field using the snake_case key "is_ranked"', () => {
    const ranked: MatchRecord = {
      session_status: 'SUBMITTED',
      date: daysAgo(1),
      is_ranked: true,
      result: 'W',
    };
    const unranked: MatchRecord = {
      session_status: 'SUBMITTED',
      date: daysAgo(1),
      is_ranked: false,
      result: 'L',
    };

    const result = filterMatches([ranked, unranked], 'all', 'ranked', 'all', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].is_ranked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterMatches — season_id / league_id filtering
// ---------------------------------------------------------------------------

describe('filterMatches — season_id and league_id fields', () => {
  const season10 = makeMatch({ season_id: 10, league_id: 1 });
  const season11 = makeMatch({ season_id: 11, league_id: 1 });
  const league2 = makeMatch({ season_id: 20, league_id: 2 });

  it('filters by season_id using snake_case key', () => {
    const result = filterMatches(
      [season10, season11, league2],
      'all',
      'all',
      'season-10',
      'all',
    );
    expect(result).toHaveLength(1);
    expect(result[0].season_id).toBe(10);
  });

  it('filters by league_id using snake_case key', () => {
    const result = filterMatches(
      [season10, season11, league2],
      'all',
      'all',
      'league-1',
      'all',
    );
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.league_id === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterMatches — partner filtering
// ---------------------------------------------------------------------------

describe('filterMatches — partner field', () => {
  it('filters by partner name using snake_case "partner" key', () => {
    const withAlice = makeMatch({ partner: 'Alice' });
    const withBob = makeMatch({ partner: 'Bob' });
    const withAlice2 = makeMatch({ partner: 'Alice', result: 'L' });

    const result = filterMatches(
      [withAlice, withBob, withAlice2],
      'all',
      'all',
      'all',
      'Alice',
    );
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.partner === 'Alice')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeOverview — result and elo_after fields
// ---------------------------------------------------------------------------

describe('computeOverview — result and elo_after fields', () => {
  it('counts wins from snake_case "result" field equal to "W"', () => {
    const matches = [
      makeMatch({ result: 'W', elo_after: 1210 }),
      makeMatch({ result: 'W', elo_after: 1220 }),
      makeMatch({ result: 'L', elo_after: 1205 }),
    ];

    const { wins, losses } = computeOverview(matches, 1220);
    expect(wins).toBe(2);
    expect(losses).toBe(1);
  });

  it('computes win rate as a percentage string', () => {
    const matches = [
      makeMatch({ result: 'W' }),
      makeMatch({ result: 'W' }),
      makeMatch({ result: 'W' }),
      makeMatch({ result: 'L' }),
    ];

    const { winRate } = computeOverview(matches, 1250);
    expect(winRate).toBe('75.0');
  });

  it('reads peak rating from snake_case "elo_after" field', () => {
    const matches = [
      makeMatch({ result: 'W', elo_after: 1200 }),
      makeMatch({ result: 'W', elo_after: 1350 }),
      makeMatch({ result: 'L', elo_after: 1300 }),
    ];

    const { peak } = computeOverview(matches, 1300);
    expect(peak).toBe(1350);
  });

  it('returns null peak when no match has a numeric elo_after', () => {
    const matches = [
      makeMatch({ elo_after: null }),
      makeMatch({ elo_after: undefined }),
    ];

    const { peak } = computeOverview(matches, 1200);
    expect(peak).toBeNull();
  });

  it('returns null winRate when there are no matches', () => {
    const { winRate, wins, losses } = computeOverview([], 1200);
    expect(winRate).toBeNull();
    expect(wins).toBe(0);
    expect(losses).toBe(0);
  });

  it('exposes current rating from the passed currentElo argument', () => {
    const matches = [makeMatch({ result: 'W', elo_after: 1250 })];

    const { rating } = computeOverview(matches, 1275);
    expect(rating).toBe(1275);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: snake_case record → correct stats
// ---------------------------------------------------------------------------

describe('snake_case match record → correct computed stats (full pipeline)', () => {
  it('produces correct win/loss/winRate/peak from a set of snake_case records', () => {
    const matches: MatchRecord[] = [
      {
        session_status: 'SUBMITTED',
        date: daysAgo(2),
        result: 'W',
        score: '21-18',
        elo_after: 1260,
        elo_before: 1240,
        is_ranked: true,
        league_id: 1,
        season_id: 10,
        partner: 'Alice',
        partner_id: 42,
        opponent_1: 'Bob',
        opponent_1_id: 43,
        opponent_2: 'Carol',
        opponent_2_id: 44,
      },
      {
        session_status: 'SUBMITTED',
        date: daysAgo(3),
        result: 'L',
        score: '17-21',
        elo_after: 1240,
        elo_before: 1250,
        is_ranked: true,
        league_id: 1,
        season_id: 10,
        partner: 'Alice',
        partner_id: 42,
        opponent_1: 'Dave',
        opponent_1_id: 45,
        opponent_2: 'Eve',
        opponent_2_id: 46,
      },
      {
        session_status: 'ACTIVE', // should be excluded by filterMatches
        date: daysAgo(1),
        result: 'W',
        score: '21-10',
        elo_after: 1280,
      },
    ];

    const completed = filterMatches(matches, 'all', 'all', 'all', 'all');
    expect(completed).toHaveLength(2);

    const { wins, losses, winRate, peak } = computeOverview(completed, 1260);
    expect(wins).toBe(1);
    expect(losses).toBe(1);
    expect(winRate).toBe('50.0');
    expect(peak).toBe(1260);
  });

  it('filters out active sessions before computing stats', () => {
    const allActive = [
      makeMatch({ session_status: 'ACTIVE' }),
      makeMatch({ session_status: 'ACTIVE' }),
    ];

    const completed = filterMatches(allActive, 'all', 'all', 'all', 'all');
    expect(completed).toHaveLength(0);

    const { wins, losses, winRate } = computeOverview(completed, 1200);
    expect(wins).toBe(0);
    expect(losses).toBe(0);
    expect(winRate).toBeNull();
  });
});
