import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateTimeWithTimezone,
  formatDate,
  formatTime,
  utcTimeToLocal,
  utcTimeToLocalWithTimezone,
  formatRelativeTime,
} from '../dateUtils.js';

// ─── formatDateTimeWithTimezone ───────────────────────────────────────────────

describe('formatDateTimeWithTimezone', () => {
  it('returns empty string for null', () => {
    expect(formatDateTimeWithTimezone(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateTimeWithTimezone(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatDateTimeWithTimezone('')).toBe('');
  });

  it('returns a non-empty string for a valid ISO timestamp', () => {
    const result = formatDateTimeWithTimezone('2024-06-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains "at" separator between date and time', () => {
    const result = formatDateTimeWithTimezone('2024-06-15T10:30:00Z');
    expect(result).toContain(' at ');
  });

  it('includes the year when showYear is true (default)', () => {
    const result = formatDateTimeWithTimezone('2024-06-15T10:30:00Z', true);
    expect(result).toContain('2024');
  });

  it('does not include the year when showYear is false', () => {
    const result = formatDateTimeWithTimezone('2024-06-15T10:30:00Z', false);
    expect(result).not.toContain('2024');
  });

  it('includes a timezone abbreviation (e.g. PST, UTC, EST)', () => {
    const result = formatDateTimeWithTimezone('2024-06-15T10:30:00Z');
    // Timezone abbreviations are 2–5 uppercase letters
    expect(result).toMatch(/[A-Z]{2,5}/);
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatDate('')).toBe('');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2024-01-20T00:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the year in the output', () => {
    const result = formatDate('2024-03-15T12:00:00Z');
    expect(result).toContain('2024');
  });

  it('does not include a time component', () => {
    const result = formatDate('2024-03-15T12:00:00Z');
    // Should not contain AM/PM indicators
    expect(result).not.toMatch(/\d:\d\d/);
  });

  it('handles a date string without time component', () => {
    const result = formatDate('2023-12-25');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatTime(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatTime('')).toBe('');
  });

  it('returns a non-empty string for a valid ISO timestamp', () => {
    const result = formatTime('2024-06-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes AM or PM in the output', () => {
    const result = formatTime('2024-06-15T10:30:00Z');
    expect(result).toMatch(/AM|PM/i);
  });

  it('includes a timezone abbreviation', () => {
    const result = formatTime('2024-06-15T10:30:00Z');
    expect(result).toMatch(/[A-Z]{2,5}/);
  });
});

// ─── utcTimeToLocal ───────────────────────────────────────────────────────────

describe('utcTimeToLocal', () => {
  it('returns null for null input', () => {
    expect(utcTimeToLocal(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(utcTimeToLocal(undefined)).toBeUndefined();
  });

  it('returns empty string for empty string', () => {
    expect(utcTimeToLocal('')).toBe('');
  });

  it('returns a string in HH:MM format', () => {
    const result = utcTimeToLocal('12:00');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('pads hours with leading zero', () => {
    // UTC midnight will be some local time; result must always have 2-digit hour
    const result = utcTimeToLocal('00:00');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('pads minutes with leading zero', () => {
    const result = utcTimeToLocal('10:05');
    // Minutes part must be exactly 2 digits
    const minutes = result.split(':')[1];
    expect(minutes).toHaveLength(2);
  });

  it('handles midnight UTC (00:00)', () => {
    const result = utcTimeToLocal('00:00');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('handles end-of-day UTC (23:59)', () => {
    const result = utcTimeToLocal('23:59');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ─── utcTimeToLocalWithTimezone ───────────────────────────────────────────────

describe('utcTimeToLocalWithTimezone', () => {
  it('returns null for null input', () => {
    expect(utcTimeToLocalWithTimezone(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(utcTimeToLocalWithTimezone(undefined)).toBeUndefined();
  });

  it('returns empty string for empty string', () => {
    expect(utcTimeToLocalWithTimezone('')).toBe('');
  });

  it('returns a non-empty string for a valid UTC time', () => {
    const result = utcTimeToLocalWithTimezone('14:30');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes AM or PM', () => {
    const result = utcTimeToLocalWithTimezone('14:30');
    expect(result).toMatch(/AM|PM/i);
  });

  it('includes a timezone abbreviation', () => {
    const result = utcTimeToLocalWithTimezone('14:30');
    expect(result).toMatch(/[A-Z]{2,5}/);
  });

  it('handles midnight UTC (00:00)', () => {
    const result = utcTimeToLocalWithTimezone('00:00');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  let now;

  beforeEach(() => {
    now = new Date('2024-06-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null input', () => {
    expect(formatRelativeTime(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatRelativeTime(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatRelativeTime('')).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(formatRelativeTime('not-a-date')).toBeNull();
  });

  it('returns "Just now" for a timestamp less than 1 minute ago', () => {
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('Just now');
  });

  it('returns "1 minute ago" for exactly 1 minute ago', () => {
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
  });

  it('returns "X minutes ago" for multiple minutes ago', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
  });

  it('returns "1 hour ago" for exactly 1 hour ago', () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns "X hours ago" for multiple hours ago', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
  });

  it('returns "Yesterday" for a timestamp 1 day ago', () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe('Yesterday');
  });

  it('returns "X days ago" for 2–6 days ago', () => {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
  });

  it('returns "1 week ago" for exactly 7 days ago', () => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(sevenDaysAgo)).toBe('1 week ago');
  });

  it('returns "X weeks ago" for 14–29 days ago', () => {
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoWeeksAgo)).toBe('2 weeks ago');
  });

  it('returns a formatted date string for timestamps >= 30 days ago', () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(thirtyDaysAgo);
    // Should be a formatted date like "May 16, 2024"
    expect(typeof result).toBe('string');
    expect(result).not.toMatch(/ago/);
    expect(result).toMatch(/\d{4}/); // contains a year
  });

  it('accepts a Date object as input', () => {
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    expect(formatRelativeTime(twoMinutesAgo)).toBe('2 minutes ago');
  });

  it('returns "Just now" for the current moment (diff = 0ms)', () => {
    expect(formatRelativeTime(now.toISOString())).toBe('Just now');
  });

  it('returns "6 days ago" at the boundary before a week', () => {
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(sixDaysAgo)).toBe('6 days ago');
  });

  it('returns "4 weeks ago" for 28 days ago', () => {
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twentyEightDaysAgo)).toBe('4 weeks ago');
  });
});
