import { describe, it, expect } from 'vitest';
import {
  GENDER_FILTER_OPTIONS,
  LEVEL_FILTER_OPTIONS,
  LEVEL_OPTIONS,
  GENDER_OPTIONS_LEAGUE,
  GENDER_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  PLAYER_LEVEL_FILTER_OPTIONS,
} from '../playerFilterOptions';

/** Assert every item in an array has string `value` and `label` properties. */
function expectWellFormedOptions(options) {
  for (const option of options) {
    expect(typeof option.value).toBe('string');
    expect(typeof option.label).toBe('string');
  }
}

/** Assert no two items in an array share the same `value`. */
function expectNoDuplicateValues(options) {
  const values = options.map((o) => o.value);
  const unique = new Set(values);
  expect(unique.size).toBe(values.length);
}

describe('GENDER_FILTER_OPTIONS', () => {
  it('has exactly 3 items', () => {
    expect(GENDER_FILTER_OPTIONS).toHaveLength(3);
  });

  it('contains an "All genders" option with an empty value', () => {
    const allGenders = GENDER_FILTER_OPTIONS.find((o) => o.value === '');
    expect(allGenders).toBeDefined();
    expect(allGenders.label).toBe('All genders');
  });

  it('contains male and female options', () => {
    const values = GENDER_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toContain('male');
    expect(values).toContain('female');
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(GENDER_FILTER_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(GENDER_FILTER_OPTIONS);
  });
});

describe('LEVEL_FILTER_OPTIONS', () => {
  it('has exactly 6 items', () => {
    expect(LEVEL_FILTER_OPTIONS).toHaveLength(6);
  });

  it('all non-empty values are lowercase', () => {
    const nonEmpty = LEVEL_FILTER_OPTIONS.filter((o) => o.value !== '');
    for (const option of nonEmpty) {
      expect(option.value).toBe(option.value.toLowerCase());
    }
  });

  it('includes "open" with a lowercase value', () => {
    const open = LEVEL_FILTER_OPTIONS.find((o) => o.value === 'open');
    expect(open).toBeDefined();
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(LEVEL_FILTER_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(LEVEL_FILTER_OPTIONS);
  });
});

describe('LEVEL_OPTIONS', () => {
  it('has exactly 6 items', () => {
    expect(LEVEL_OPTIONS).toHaveLength(6);
  });

  it('first item is the "Select skill level" placeholder', () => {
    expect(LEVEL_OPTIONS[0]).toEqual({ value: '', label: 'Select skill level' });
  });

  it('contains "Open" with a capital O (not lowercase)', () => {
    const open = LEVEL_OPTIONS.find((o) => o.value === 'Open');
    expect(open).toBeDefined();
    expect(open.label).toBe('Open');
  });

  it('does not contain a lowercase "open" value', () => {
    const lowerOpen = LEVEL_OPTIONS.find((o) => o.value === 'open');
    expect(lowerOpen).toBeUndefined();
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(LEVEL_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(LEVEL_OPTIONS);
  });
});

describe('GENDER_OPTIONS_LEAGUE', () => {
  it('has exactly 2 items (no empty-value option)', () => {
    expect(GENDER_OPTIONS_LEAGUE).toHaveLength(2);
  });

  it('contains no item with an empty value', () => {
    const empty = GENDER_OPTIONS_LEAGUE.find((o) => o.value === '');
    expect(empty).toBeUndefined();
  });

  it('is derived from GENDER_FILTER_OPTIONS (same male/female entries)', () => {
    const male = GENDER_OPTIONS_LEAGUE.find((o) => o.value === 'male');
    const female = GENDER_OPTIONS_LEAGUE.find((o) => o.value === 'female');
    expect(male).toBeDefined();
    expect(female).toBeDefined();
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(GENDER_OPTIONS_LEAGUE);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(GENDER_OPTIONS_LEAGUE);
  });
});

describe('GENDER_OPTIONS', () => {
  it('has exactly 2 items', () => {
    expect(GENDER_OPTIONS).toHaveLength(2);
  });

  it('uses "Male" and "Female" labels (not "Men\'s" / "Women\'s")', () => {
    const labels = GENDER_OPTIONS.map((o) => o.label);
    expect(labels).toContain('Male');
    expect(labels).toContain('Female');
    expect(labels).not.toContain("Men's");
    expect(labels).not.toContain("Women's");
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(GENDER_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(GENDER_OPTIONS);
  });
});

describe('SKILL_LEVEL_OPTIONS', () => {
  it('has exactly 6 items', () => {
    expect(SKILL_LEVEL_OPTIONS).toHaveLength(6);
  });

  it('includes an "AA" option', () => {
    const aa = SKILL_LEVEL_OPTIONS.find((o) => o.value === 'AA');
    expect(aa).toBeDefined();
    expect(aa.label).toBe('AA');
  });

  it('contains no empty-value option', () => {
    const empty = SKILL_LEVEL_OPTIONS.find((o) => o.value === '');
    expect(empty).toBeUndefined();
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(SKILL_LEVEL_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(SKILL_LEVEL_OPTIONS);
  });
});

describe('PLAYER_LEVEL_FILTER_OPTIONS', () => {
  it('has exactly 7 items', () => {
    expect(PLAYER_LEVEL_FILTER_OPTIONS).toHaveLength(7);
  });

  it('first item is the "All Levels" placeholder with an empty value', () => {
    expect(PLAYER_LEVEL_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'All Levels' });
  });

  it('includes an "AA" option', () => {
    const aa = PLAYER_LEVEL_FILTER_OPTIONS.find((o) => o.value === 'AA');
    expect(aa).toBeDefined();
  });

  it('includes an "Open" option', () => {
    const open = PLAYER_LEVEL_FILTER_OPTIONS.find((o) => o.value === 'Open');
    expect(open).toBeDefined();
  });

  it('every item has string value and label', () => {
    expectWellFormedOptions(PLAYER_LEVEL_FILTER_OPTIONS);
  });

  it('has no duplicate values', () => {
    expectNoDuplicateValues(PLAYER_LEVEL_FILTER_OPTIONS);
  });
});
