import { describe, it, expect } from 'vitest';
import { formatGender } from '../formatters';

describe('formatGender', () => {
  // ─── Known mappings ─────────────────────────────────────────────────────────

  it('maps "male" to "Men\'s"', () => {
    expect(formatGender('male')).toBe("Men's");
  });

  it('maps "female" to "Women\'s"', () => {
    expect(formatGender('female')).toBe("Women's");
  });

  it('maps "coed" to "Co-ed"', () => {
    expect(formatGender('coed')).toBe('Co-ed');
  });

  // ─── Case-insensitivity ─────────────────────────────────────────────────────

  it('maps "MALE" (uppercase) to "Men\'s"', () => {
    expect(formatGender('MALE')).toBe("Men's");
  });

  it('maps "FEMALE" (uppercase) to "Women\'s"', () => {
    expect(formatGender('FEMALE')).toBe("Women's");
  });

  it('maps "COED" (uppercase) to "Co-ed"', () => {
    expect(formatGender('COED')).toBe('Co-ed');
  });

  it('maps "Male" (mixed case) to "Men\'s"', () => {
    expect(formatGender('Male')).toBe("Men's");
  });

  it('maps "Female" (mixed case) to "Women\'s"', () => {
    expect(formatGender('Female')).toBe("Women's");
  });

  it('maps "Coed" (mixed case) to "Co-ed"', () => {
    expect(formatGender('Coed')).toBe('Co-ed');
  });

  // ─── Fallback behaviour ─────────────────────────────────────────────────────

  it('returns the original value for an unknown gender string', () => {
    expect(formatGender('nonbinary')).toBe('nonbinary');
  });

  it('returns the original value for an arbitrary string', () => {
    expect(formatGender('other')).toBe('other');
  });

  it('returns undefined for undefined input (falsy optional chain)', () => {
    // gender?.toLowerCase() → undefined, map[undefined] → undefined, fallback → undefined
    expect(formatGender(undefined)).toBeUndefined();
  });

  it('returns null for null input', () => {
    // null?.toLowerCase() → undefined, map[undefined] → undefined, fallback → null
    expect(formatGender(null)).toBeNull();
  });

  it('returns empty string for empty string input', () => {
    // ''.toLowerCase() → '', map[''] → undefined, fallback → ''
    expect(formatGender('')).toBe('');
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  it('returns the original value for a numeric string', () => {
    expect(formatGender('123')).toBe('123');
  });
});
