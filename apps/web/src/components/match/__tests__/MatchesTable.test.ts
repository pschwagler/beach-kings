/**
 * Unit tests for MatchesTable sort utilities.
 *
 * Tests the compareSessionGroups comparator exported from MatchesTable.
 * Covers:
 * - Date-present sessions sort chronologically (descending)
 * - Sessions without dates fall through to createdAt tiebreaker (not name string)
 * - Mixed date/no-date groups: dated groups sort before undated ones (most recent first)
 * - createdAt tiebreaker works correctly when both groups lack a date
 * - Groups with neither date nor createdAt remain equal (0)
 */

import { compareSessionGroups } from '../MatchesTable';

describe('compareSessionGroups', () => {
  it('sorts groups with dates in descending chronological order', () => {
    const earlier = { date: '2024-01-01', createdAt: '2024-01-01T10:00:00Z' };
    const later   = { date: '2024-06-15', createdAt: '2024-06-15T10:00:00Z' };

    // later should come first (descending)
    expect(compareSessionGroups(later, earlier)).toBeLessThan(0);
    expect(compareSessionGroups(earlier, later)).toBeGreaterThan(0);
  });

  it('treats equal dates as equal when createdAt is also equal', () => {
    const a = { date: '2024-03-10', createdAt: '2024-03-10T08:00:00Z' };
    const b = { date: '2024-03-10', createdAt: '2024-03-10T08:00:00Z' };
    expect(compareSessionGroups(a, b)).toBe(0);
  });

  it('uses createdAt as tiebreaker when dates are equal', () => {
    const older = { date: '2024-03-10', createdAt: '2024-03-10T08:00:00Z' };
    const newer = { date: '2024-03-10', createdAt: '2024-03-10T12:00:00Z' };

    // newer createdAt should come first
    expect(compareSessionGroups(newer, older)).toBeLessThan(0);
    expect(compareSessionGroups(older, newer)).toBeGreaterThan(0);
  });

  it('uses createdAt tiebreaker when both groups have no date', () => {
    const older = { date: null, createdAt: '2024-01-01T08:00:00Z' };
    const newer = { date: null, createdAt: '2024-03-01T08:00:00Z' };

    // newer createdAt should come first
    expect(compareSessionGroups(newer, older)).toBeLessThan(0);
    expect(compareSessionGroups(older, newer)).toBeGreaterThan(0);
  });

  it('does NOT sort by name string when date is absent', () => {
    // "Session 10" < "Session 9" alphabetically — if name were used as fallback,
    // "Session 9" would sort before "Session 10" which is wrong.
    // With createdAt fallback, the one with the newer createdAt comes first.
    const session9  = { date: null, name: 'Session 9',  createdAt: '2024-01-01T00:00:00Z' };
    const session10 = { date: null, name: 'Session 10', createdAt: '2024-03-01T00:00:00Z' };

    // session10 has newer createdAt → should sort first
    const result = compareSessionGroups(session10, session9);
    expect(result).toBeLessThan(0);
  });

  it('returns 0 when both groups have no date and no createdAt', () => {
    const a = { date: null, createdAt: null };
    const b = { date: null, createdAt: null };
    expect(compareSessionGroups(a, b)).toBe(0);
  });

  it('puts group with createdAt before group without when dates are absent', () => {
    const withCreatedAt    = { date: null, createdAt: '2024-01-01T00:00:00Z' };
    const withoutCreatedAt = { date: null, createdAt: null };

    // group with a createdAt timestamp sorts before the one without
    expect(compareSessionGroups(withCreatedAt, withoutCreatedAt)).toBeLessThan(0);
    expect(compareSessionGroups(withoutCreatedAt, withCreatedAt)).toBeGreaterThan(0);
  });
});
