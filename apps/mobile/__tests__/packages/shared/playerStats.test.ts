/**
 * Tests for normalizePlayerStats (packages/shared/src/utils/playerStats.ts).
 *
 * Covers the nested-vs-flat fallback contract shared by the profile tab,
 * home tab, and PlayerStatsGrid: nested `stats.*` wins when present, flat
 * fields are the fallback, real `0` values must be preserved (never treated
 * as missing), `losses` is derived from real wins when absent, and unknown
 * wins/losses stay `null` (never fabricated) — including for a null/undefined
 * player and for a privacy-hidden public profile.
 */

import { normalizePlayerStats } from '@beach-kings/shared';

describe('normalizePlayerStats', () => {
  it('returns null wins/losses for a null player', () => {
    expect(normalizePlayerStats(null)).toEqual({
      rating: null,
      games: 0,
      wins: null,
      losses: null,
    });
  });

  it('returns null wins/losses for an undefined player', () => {
    expect(normalizePlayerStats(undefined)).toEqual({
      rating: null,
      games: 0,
      wins: null,
      losses: null,
    });
  });

  it('reads flat fields when no nested `stats` bag is present', () => {
    const player = {
      current_rating: 1438,
      total_games: 94,
      wins: 66,
      losses: 28,
    };
    expect(normalizePlayerStats(player)).toEqual({
      rating: 1438,
      games: 94,
      wins: 66,
      losses: 28,
    });
  });

  it('reads nested `stats.*` fields when top-level fields are absent', () => {
    const player = {
      stats: {
        current_rating: 1447,
        total_games: 94,
        total_wins: 66,
      },
    };
    // losses has no nested equivalent — always derived from games/wins.
    expect(normalizePlayerStats(player)).toEqual({
      rating: 1447,
      games: 94,
      wins: 66,
      losses: 28,
    });
  });

  it('prefers nested `stats.*` over flat fields when both are present', () => {
    const player = {
      current_rating: 1000,
      total_games: 10,
      wins: 5,
      losses: 5,
      stats: {
        current_rating: 1447,
        total_games: 94,
        total_wins: 66,
      },
    };
    expect(normalizePlayerStats(player)).toEqual({
      rating: 1447,
      games: 94,
      wins: 66,
      // `losses` is read directly off the player (not derived) since it is
      // present at the top level.
      losses: 5,
    });
  });

  it('preserves a real `0` rating instead of falling back', () => {
    const player = { current_rating: 0, total_games: 10, wins: 0, losses: 10 };
    expect(normalizePlayerStats(player).rating).toBe(0);
  });

  it('preserves a real `0` in nested stats instead of falling back to the flat field', () => {
    const player = {
      current_rating: 1438,
      stats: { current_rating: 0, total_games: 5, total_wins: 0 },
    };
    expect(normalizePlayerStats(player)).toEqual({
      rating: 0,
      games: 5,
      wins: 0,
      losses: 5,
    });
  });

  it('preserves a real `0` games/wins count instead of defaulting due to falsiness', () => {
    const player = { total_games: 0, wins: 0 };
    const result = normalizePlayerStats(player);
    expect(result.games).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
  });

  it('derives losses from games - wins when `losses` is absent', () => {
    const player = { total_games: 50, wins: 30 };
    expect(normalizePlayerStats(player).losses).toBe(20);
  });

  it('derives losses from games - wins when `losses` is explicitly null', () => {
    const player = { total_games: 10, wins: 0, losses: null };
    expect(normalizePlayerStats(player).losses).toBe(10);
  });

  it('floors derived losses at 0 (never negative)', () => {
    const player = { total_games: 5, wins: 8 };
    expect(normalizePlayerStats(player).losses).toBe(0);
  });

  it('returns null rating and null wins/losses when neither shape provides them', () => {
    expect(normalizePlayerStats({})).toEqual({
      rating: null,
      games: 0,
      wins: null,
      losses: null,
    });
  });

  it('does NOT fabricate a loss record when wins is hidden but games is positive', () => {
    // Privacy-gated public profile: game_history_visible === false makes the
    // backend return total_wins: null with a positive total_games. wins/losses
    // must stay null, not collapse to 0 wins / games losses.
    const hiddenPublicPlayer = {
      current_rating: 1500,
      total_games: 40,
      total_wins: null,
      losses: null,
    };
    expect(normalizePlayerStats(hiddenPublicPlayer)).toEqual({
      rating: 1500,
      games: 40,
      wins: null,
      losses: null,
    });
  });

  it('keeps wins/losses null when both are absent but games is known', () => {
    expect(normalizePlayerStats({ total_games: 40 })).toEqual({
      rating: null,
      games: 40,
      wins: null,
      losses: null,
    });
  });

  it('honors an explicit losses value even when wins is unknown', () => {
    expect(normalizePlayerStats({ total_games: 40, losses: 12 })).toMatchObject({
      games: 40,
      wins: null,
      losses: 12,
    });
  });
});
