/**
 * Tests for pure formatting utilities in @/lib/formatters.
 */
import {
  formatGameScore,
  formatRecord,
  formatWinRate,
  formatElo,
  formatPlayerName,
  formatOrdinal,
  formatDate,
} from '@/lib/formatters';

// ---------------------------------------------------------------------------
// formatGameScore
// ---------------------------------------------------------------------------
describe('formatGameScore', () => {
  it('formats a score as "team1-team2"', () => {
    expect(formatGameScore(21, 19)).toBe('21-19');
  });

  it('handles zero scores', () => {
    expect(formatGameScore(0, 0)).toBe('0-0');
  });
});

// ---------------------------------------------------------------------------
// formatRecord
// ---------------------------------------------------------------------------
describe('formatRecord', () => {
  it('formats wins and losses', () => {
    expect(formatRecord(12, 3)).toBe('12-3');
  });

  it('handles all-zero record', () => {
    expect(formatRecord(0, 0)).toBe('0-0');
  });
});

// ---------------------------------------------------------------------------
// formatWinRate
// ---------------------------------------------------------------------------
describe('formatWinRate', () => {
  it('calculates win rate percentage', () => {
    expect(formatWinRate(8, 2)).toBe('80%');
  });

  it('returns 0% when no games played', () => {
    expect(formatWinRate(0, 0)).toBe('0%');
  });

  it('returns 100% for undefeated record', () => {
    expect(formatWinRate(5, 0)).toBe('100%');
  });
});

// ---------------------------------------------------------------------------
// formatElo
// ---------------------------------------------------------------------------
describe('formatElo', () => {
  it('formats 1450 with thousands separator', () => {
    const result = formatElo(1450);
    expect(result).toContain('1');
    expect(result).toContain('450');
  });

  it('formats sub-1000 ratings without separator', () => {
    expect(formatElo(900)).toBe('900');
  });
});

// ---------------------------------------------------------------------------
// formatPlayerName
// ---------------------------------------------------------------------------
describe('formatPlayerName', () => {
  it('returns full name when no nickname', () => {
    expect(formatPlayerName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe');
  });

  it('prefers nickname over full name', () => {
    expect(formatPlayerName({ nickname: 'JD' })).toBe('JD');
  });

  it('returns nickname even when full name is present', () => {
    expect(formatPlayerName({ first_name: 'John', last_name: 'Doe', nickname: 'JD' })).toBe('JD');
  });

  it('returns empty string for empty object', () => {
    expect(formatPlayerName({})).toBe('');
  });

  it('returns first name only when last name is absent', () => {
    expect(formatPlayerName({ first_name: 'Jane' })).toBe('Jane');
  });
});

// ---------------------------------------------------------------------------
// formatOrdinal
// ---------------------------------------------------------------------------
describe('formatOrdinal', () => {
  it('formats 1 as 1st', () => expect(formatOrdinal(1)).toBe('1st'));
  it('formats 2 as 2nd', () => expect(formatOrdinal(2)).toBe('2nd'));
  it('formats 3 as 3rd', () => expect(formatOrdinal(3)).toBe('3rd'));
  it('formats 4 as 4th', () => expect(formatOrdinal(4)).toBe('4th'));
  it('formats 11 as 11th (teen exception)', () => expect(formatOrdinal(11)).toBe('11th'));
  it('formats 12 as 12th (teen exception)', () => expect(formatOrdinal(12)).toBe('12th'));
  it('formats 13 as 13th (teen exception)', () => expect(formatOrdinal(13)).toBe('13th'));
  it('formats 21 as 21st', () => expect(formatOrdinal(21)).toBe('21st'));
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns "just now" for a very recent date in relative mode', () => {
    const now = new Date();
    expect(formatDate(now, 'relative')).toBe('just now');
  });

  it('short format contains a month abbreviation', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result = formatDate(new Date(), 'short');
    const hasMonth = months.some((m) => result.includes(m));
    expect(hasMonth).toBe(true);
  });

  it('long format includes year', () => {
    const date = new Date('2025-03-15T12:00:00Z');
    expect(formatDate(date, 'long')).toContain('2025');
  });

  it('relative format shows minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatDate(fiveMinutesAgo, 'relative')).toBe('5m ago');
  });

  it('accepts ISO string input', () => {
    const result = formatDate('2025-03-15T12:00:00Z', 'short');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
