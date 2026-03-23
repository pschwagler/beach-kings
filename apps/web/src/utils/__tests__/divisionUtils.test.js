import { describe, it, expect } from 'vitest';
import { formatDivisionLabel } from '../divisionUtils.js';

describe('formatDivisionLabel', () => {
  // ─── Both gender and level provided ────────────────────────────────────────

  it('returns "Mens Open" for male + open', () => {
    expect(formatDivisionLabel('male', 'open')).toBe('Mens Open');
  });

  it('returns "Womens Open" for female + open', () => {
    expect(formatDivisionLabel('female', 'open')).toBe('Womens Open');
  });

  it('returns "Mens Advanced" for male + advanced', () => {
    expect(formatDivisionLabel('male', 'advanced')).toBe('Mens Advanced');
  });

  it('returns "Womens Advanced" for female + advanced', () => {
    expect(formatDivisionLabel('female', 'advanced')).toBe('Womens Advanced');
  });

  it('returns "Mens Beginner" for male + beginner', () => {
    expect(formatDivisionLabel('male', 'beginner')).toBe('Mens Beginner');
  });

  it('returns "Womens Beginner" for female + beginner', () => {
    expect(formatDivisionLabel('female', 'beginner')).toBe('Womens Beginner');
  });

  it('capitalises the first letter of the level', () => {
    expect(formatDivisionLabel('male', 'intermediate')).toBe('Mens Intermediate');
  });

  it('lowercases the rest of the level string', () => {
    expect(formatDivisionLabel('male', 'OPEN')).toBe('Mens Open');
  });

  // ─── Case-insensitive gender matching ──────────────────────────────────────

  it('handles uppercase "MALE"', () => {
    expect(formatDivisionLabel('MALE', 'open')).toBe('Mens Open');
  });

  it('handles uppercase "FEMALE"', () => {
    expect(formatDivisionLabel('FEMALE', 'open')).toBe('Womens Open');
  });

  it('handles mixed-case "Male"', () => {
    expect(formatDivisionLabel('Male', 'open')).toBe('Mens Open');
  });

  it('handles mixed-case "Female"', () => {
    expect(formatDivisionLabel('Female', 'open')).toBe('Womens Open');
  });

  // ─── Gender only (no level) ─────────────────────────────────────────────────

  it('returns "Mens" when gender is male and level is undefined', () => {
    expect(formatDivisionLabel('male', undefined)).toBe('Mens');
  });

  it('returns "Womens" when gender is female and level is undefined', () => {
    expect(formatDivisionLabel('female', undefined)).toBe('Womens');
  });

  it('returns "Mens" when gender is male and level is null', () => {
    expect(formatDivisionLabel('male', null)).toBe('Mens');
  });

  it('returns "Womens" when gender is female and level is null', () => {
    expect(formatDivisionLabel('female', null)).toBe('Womens');
  });

  it('returns "Mens" when gender is male and level is empty string', () => {
    expect(formatDivisionLabel('male', '')).toBe('Mens');
  });

  // ─── Level only (no gender) ─────────────────────────────────────────────────

  it('returns "Open" when gender is undefined and level is open', () => {
    expect(formatDivisionLabel(undefined, 'open')).toBe('Open');
  });

  it('returns "Advanced" when gender is null and level is advanced', () => {
    expect(formatDivisionLabel(null, 'advanced')).toBe('Advanced');
  });

  it('returns "Beginner" when gender is empty string and level is beginner', () => {
    expect(formatDivisionLabel('', 'beginner')).toBe('Beginner');
  });

  it('returns level label for an unrecognised gender string', () => {
    // 'coed' is not 'male' or 'female', so genderLabel is null; only levelLabel returned
    expect(formatDivisionLabel('coed', 'open')).toBe('Open');
  });

  // ─── Both missing ───────────────────────────────────────────────────────────

  it('returns null when both gender and level are undefined', () => {
    expect(formatDivisionLabel(undefined, undefined)).toBeNull();
  });

  it('returns null when both gender and level are null', () => {
    expect(formatDivisionLabel(null, null)).toBeNull();
  });

  it('returns null when both gender and level are empty strings', () => {
    expect(formatDivisionLabel('', '')).toBeNull();
  });

  it('returns null when called with no arguments', () => {
    expect(formatDivisionLabel()).toBeNull();
  });

  // ─── Level capitalisation edge cases ───────────────────────────────────────

  it('capitalises a single-character level', () => {
    expect(formatDivisionLabel('male', 'a')).toBe('Mens A');
  });

  it('handles level with leading/trailing whitespace', () => {
    // trim() is applied to level before capitalisation
    expect(formatDivisionLabel('male', '  open  ')).toBe('Mens Open');
  });

  it('lowercases a fully uppercase level string', () => {
    expect(formatDivisionLabel('female', 'ADVANCED')).toBe('Womens Advanced');
  });
});
