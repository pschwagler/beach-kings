/**
 * Centralized options for player/league gender and skill level.
 * Single source of truth for filters, forms, and display.
 *
 * Backend values:
 * - Gender: male, female
 * - Level (league): juniors, beginner, intermediate, advanced, Open (capital O)
 * - Level (player profile): beginner, intermediate, advanced, AA, Open
 * - Level (filter API): lowercase for filters (open, aa) – backend accepts both
 */

/** Options for gender filter: All + Men's / Women's. Values match backend (male/female). */
export const GENDER_FILTER_OPTIONS = [
  { value: '', label: 'All genders' },
  { value: 'male', label: "Men's" },
  { value: 'female', label: "Women's" },
];

/** Options for skill/level filter: All + Juniors through Open. Use lowercase for filter API. */
export const LEVEL_FILTER_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'open', label: 'Open' },
];

/** Level options for league create/edit forms. Backend uses "Open" (capital O). */
export const LEVEL_OPTIONS = [
  { value: '', label: 'Select skill level' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'Open', label: 'Open' },
];

/** Gender options for league/division forms (Men's, Women's). Mixed can be added with disabled: true where needed. */
export const GENDER_OPTIONS_LEAGUE = GENDER_FILTER_OPTIONS.filter((o) => o.value);

/** Gender options for player profile forms (Male, Female). Same backend values (male, female). */
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

/** Skill level options for player profile forms. Includes AA; backend accepts AA, Open. */
export const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'AA', label: 'AA' },
  { value: 'Open', label: 'Open' },
];
