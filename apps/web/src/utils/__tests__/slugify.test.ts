import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  // ─── Falsy / empty inputs ───────────────────────────────────────────────────

  it('returns empty string for null', () => {
    expect(slugify(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(slugify(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for 0 (falsy)', () => {
    expect(slugify(0)).toBe('');
  });

  it('returns empty string for false (falsy)', () => {
    expect(slugify(false)).toBe('');
  });

  // ─── Basic transformations ──────────────────────────────────────────────────

  it('lowercases all characters', () => {
    expect(slugify('HELLO WORLD')).toBe('hello-world');
  });

  it('replaces single space with hyphen', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('replaces multiple spaces with a single hyphen', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('handles a single word', () => {
    expect(slugify('Hello')).toBe('hello');
  });

  // ─── Special character stripping ───────────────────────────────────────────

  it('strips punctuation: period', () => {
    expect(slugify('hello.world')).toBe('helloworld');
  });

  it('strips punctuation: comma', () => {
    expect(slugify('hello, world')).toBe('hello-world');
  });

  it('strips punctuation: exclamation mark', () => {
    expect(slugify('hello!')).toBe('hello');
  });

  it('strips punctuation: question mark', () => {
    expect(slugify('who are you?')).toBe('who-are-you');
  });

  it('strips punctuation: apostrophe', () => {
    expect(slugify("john's league")).toBe('johns-league');
  });

  it('strips punctuation: parentheses', () => {
    expect(slugify('league (2024)')).toBe('league-2024');
  });

  it('strips punctuation: slash', () => {
    expect(slugify('a/b/c')).toBe('abc');
  });

  it('strips punctuation: ampersand', () => {
    // 'fish & chips' → strip & → 'fish  chips' → \s+ → 'fish-chips'
    expect(slugify('fish & chips')).toBe('fish-chips');
  });

  it('strips special characters but preserves hyphens', () => {
    expect(slugify('beach-kings')).toBe('beach-kings');
  });

  it('strips special characters but preserves underscores', () => {
    // \w includes underscore, so underscores are kept
    expect(slugify('beach_kings')).toBe('beach_kings');
  });

  // ─── Consecutive hyphen collapsing ─────────────────────────────────────────

  it('collapses consecutive hyphens into one', () => {
    expect(slugify('a--b')).toBe('a-b');
  });

  it('collapses many consecutive hyphens', () => {
    expect(slugify('a----b')).toBe('a-b');
  });

  it('collapses hyphens produced by stripping special characters', () => {
    // 'a & b': & stripped → 'a  b' → \s+ → 'a-b'
    expect(slugify('a & b')).toBe('a-b');
  });

  // ─── Numbers ────────────────────────────────────────────────────────────────

  it('preserves numbers', () => {
    expect(slugify('league 2024')).toBe('league-2024');
  });

  it('handles a string of only numbers', () => {
    expect(slugify('2024')).toBe('2024');
  });

  // ─── Real-world inputs ──────────────────────────────────────────────────────

  it('slugifies a full name', () => {
    expect(slugify('John Doe')).toBe('john-doe');
  });

  it('slugifies a league name with year', () => {
    expect(slugify('Summer League 2024')).toBe('summer-league-2024');
  });

  it('slugifies a title with mixed casing and punctuation', () => {
    expect(slugify('Beach Kings Pro Tour!')).toBe('beach-kings-pro-tour');
  });

  // ─── Unicode / non-ASCII ────────────────────────────────────────────────────

  it('strips accented characters (non-ASCII stripped by [^\\w\\s-])', () => {
    // é, ñ, ü are not matched by \w (which is ASCII-only in JS regex)
    // so they are stripped
    const result = slugify('café');
    expect(result).toBe('caf');
  });

  it('strips emoji characters', () => {
    // 'hello 🏖 world' → strip emoji → 'hello  world' → \s+ → 'hello-world'
    const result = slugify('hello 🏖 world');
    expect(result).toBe('hello-world');
  });

  it('handles a string with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });

  it('handles a string with only spaces', () => {
    // trim → '' → no further transformation needed
    expect(slugify('   ')).toBe('');
  });
});
