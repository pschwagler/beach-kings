/**
 * Tests for formatLocation (packages/shared/src/utils/location.ts).
 *
 * Covers the "City, State" display contract shared by the profile header and
 * the court detail screen: collapse to null when both parts are empty (so the
 * caller can omit the line rather than render a bare ", "), dedupe a state
 * name that is already baked into the `city` column, and format clean data
 * as "City, State".
 *
 * The real DB rows that motivated this (player city column already holding
 * "City, State" or worse) are exercised explicitly below.
 */

import { formatLocation, cleanCityName } from '@beach-kings/shared';

describe('formatLocation', () => {
  it('returns null when both city and state are empty', () => {
    expect(formatLocation('', '')).toBeNull();
    expect(formatLocation(null, null)).toBeNull();
    expect(formatLocation(undefined, undefined)).toBeNull();
    expect(formatLocation('   ', '  ')).toBeNull();
  });

  it('returns just the state when city is empty', () => {
    expect(formatLocation('', 'CA')).toBe('CA');
    expect(formatLocation(null, 'New York')).toBe('New York');
  });

  it('returns just the city when state is empty', () => {
    expect(formatLocation('Austin', '')).toBe('Austin');
    expect(formatLocation('Austin', null)).toBe('Austin');
  });

  it('formats clean bare-city + state data as "City, State"', () => {
    expect(formatLocation('San Diego', 'CA')).toBe('San Diego, CA');
    expect(formatLocation('Austin', 'TX')).toBe('Austin, TX');
  });

  it('does not append a redundant state when city already carries region info', () => {
    // Real rows from the players table (city column already "City, State").
    expect(formatLocation('Brooklyn, New York', 'NY')).toBe('Brooklyn, New York');
    expect(formatLocation('San Diego, California', 'CA')).toBe(
      'San Diego, California',
    );
  });

  it('dedupes a state name doubled inside the city column', () => {
    // player #1: city = "Greenpoint, New York, New York", state = "New York".
    expect(formatLocation('Greenpoint, New York, New York', 'New York')).toBe(
      'Greenpoint, New York',
    );
  });

  it('dedupes a bare city that equals the state (case-insensitive)', () => {
    expect(formatLocation('New York', 'New York')).toBe('New York');
    expect(formatLocation('new york', 'New York')).toBe('new york');
  });

  it('trims surrounding whitespace on each part', () => {
    expect(formatLocation('  Austin  ', '  TX ')).toBe('Austin, TX');
    expect(formatLocation(' Brooklyn , New York ', 'NY')).toBe(
      'Brooklyn, New York',
    );
  });

  it('collapses a city made only of separators to null', () => {
    expect(formatLocation(',', '')).toBeNull();
    expect(formatLocation(' , , ', null)).toBeNull();
  });
});

describe('cleanCityName', () => {
  it('returns a bare city unchanged', () => {
    expect(cleanCityName('Austin', 'TX')).toBe('Austin');
    expect(cleanCityName('San Diego', 'CA')).toBe('San Diego');
  });

  it('strips a trailing state baked into the city column', () => {
    // The write-side bug that corrupted the players table.
    expect(cleanCityName('San Diego, California', 'California')).toBe('San Diego');
    expect(cleanCityName('Greenpoint, New York', 'New York')).toBe('Greenpoint');
  });

  it('heals a state doubled into the city column (self-healing on next save)', () => {
    // player #1's corrupted value: "Greenpoint, New York, New York".
    expect(cleanCityName('Greenpoint, New York, New York', 'New York')).toBe(
      'Greenpoint',
    );
  });

  it('keeps region info when the trailing part is not the state (stable, non-compounding)', () => {
    // Abbreviation mismatch (city has full name, state is abbrev): does not
    // strip, but is stable — it never grows on repeated saves.
    expect(cleanCityName('Brooklyn, New York', 'NY')).toBe('Brooklyn, New York');
  });

  it('never strips the last remaining segment even if it equals the state', () => {
    expect(cleanCityName('New York', 'New York')).toBe('New York');
  });

  it('returns an empty string for empty/separator-only input', () => {
    expect(cleanCityName('', 'CA')).toBe('');
    expect(cleanCityName(null, null)).toBe('');
    expect(cleanCityName(' , , ', 'CA')).toBe('');
  });

  it('trims and dedupes segments', () => {
    expect(cleanCityName(' Greenpoint ,  New York ', 'New York')).toBe(
      'Greenpoint',
    );
  });
});
