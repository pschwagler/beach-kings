import { describe, it, expect } from 'vitest';
import {
  isPlayerOption,
  getDisplayValue,
  getValue,
  normalizePlayerNames,
  isPlayerExcluded,
  hasExactMatch,
  filterPlayers,
} from '../playerDropdownUtils';

describe('isPlayerOption', () => {
  it('returns true for a valid player option object', () => {
    expect(isPlayerOption({ value: 1, label: 'Alice' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPlayerOption(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPlayerOption(undefined)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isPlayerOption('Alice')).toBe(false);
  });

  it('returns false when the value key is missing', () => {
    expect(isPlayerOption({ label: 'Alice' })).toBe(false);
  });

  it('returns false when the label key is missing', () => {
    expect(isPlayerOption({ value: 1 })).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isPlayerOption({})).toBe(false);
  });
});

describe('getDisplayValue', () => {
  it('returns the label for a player option object', () => {
    expect(getDisplayValue({ value: 1, label: 'Alice' })).toBe('Alice');
  });

  it('returns the string itself when given a plain string', () => {
    expect(getDisplayValue('Alice')).toBe('Alice');
  });

  it('returns empty string for null', () => {
    expect(getDisplayValue(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getDisplayValue(undefined)).toBe('');
  });
});

describe('getValue', () => {
  it('returns the value property for a player option object', () => {
    expect(getValue({ value: 42, label: 'Alice' })).toBe(42);
  });

  it('returns the string itself when given a plain string', () => {
    expect(getValue('Alice')).toBe('Alice');
  });

  it('returns empty string for null', () => {
    expect(getValue(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getValue(undefined)).toBe('');
  });
});

describe('normalizePlayerNames', () => {
  it('returns empty array for null', () => {
    expect(normalizePlayerNames(null)).toEqual([]);
  });

  it('returns empty array for a non-array value', () => {
    expect(normalizePlayerNames('Alice')).toEqual([]);
    expect(normalizePlayerNames(42)).toEqual([]);
  });

  it('returns empty array for an empty array', () => {
    expect(normalizePlayerNames([])).toEqual([]);
  });

  it('wraps plain strings into player option objects', () => {
    expect(normalizePlayerNames(['Alice', 'Bob'])).toEqual([
      { value: 'Alice', label: 'Alice' },
      { value: 'Bob', label: 'Bob' },
    ]);
  });

  it('passes through existing player option objects unchanged', () => {
    const option = { value: 1, label: 'Alice' };
    const result = normalizePlayerNames([option]);
    expect(result[0]).toBe(option);
  });

  it('handles a mixed array of strings and option objects', () => {
    const option = { value: 1, label: 'Alice' };
    const result = normalizePlayerNames([option, 'Bob']);
    expect(result[0]).toBe(option);
    expect(result[1]).toEqual({ value: 'Bob', label: 'Bob' });
  });
});

describe('isPlayerExcluded', () => {
  it('returns true when excluded list contains a matching option object', () => {
    const player = { value: 1, label: 'Alice' };
    const excluded = [{ value: 1, label: 'Alice' }];
    expect(isPlayerExcluded(player, excluded)).toBe(true);
  });

  it('returns false when excluded list contains a non-matching option object', () => {
    const player = { value: 1, label: 'Alice' };
    const excluded = [{ value: 2, label: 'Bob' }];
    expect(isPlayerExcluded(player, excluded)).toBe(false);
  });

  it('returns true when excluded list contains a string matching the player value', () => {
    const player = { value: 'alice', label: 'Alice' };
    const excluded = ['alice'];
    expect(isPlayerExcluded(player, excluded)).toBe(true);
  });

  it('returns true when excluded list contains a string matching the player label', () => {
    const player = { value: 1, label: 'Alice' };
    const excluded = ['Alice'];
    expect(isPlayerExcluded(player, excluded)).toBe(true);
  });

  it('returns false when the player is not in the excluded list', () => {
    const player = { value: 1, label: 'Alice' };
    const excluded = [{ value: 2, label: 'Bob' }, 'Charlie'];
    expect(isPlayerExcluded(player, excluded)).toBe(false);
  });

  it('returns false when the excluded list is empty', () => {
    const player = { value: 1, label: 'Alice' };
    expect(isPlayerExcluded(player, [])).toBe(false);
  });
});

describe('hasExactMatch', () => {
  it('returns true for an exact case-insensitive match', () => {
    const players = [{ value: 1, label: 'Alice' }];
    expect(hasExactMatch(players, 'alice')).toBe(true);
    expect(hasExactMatch(players, 'ALICE')).toBe(true);
    expect(hasExactMatch(players, 'Alice')).toBe(true);
  });

  it('returns false for a partial match', () => {
    const players = [{ value: 1, label: 'Alice' }];
    expect(hasExactMatch(players, 'Ali')).toBe(false);
  });

  it('returns false when searchTerm is empty string', () => {
    const players = [{ value: 1, label: 'Alice' }];
    expect(hasExactMatch(players, '')).toBe(false);
  });

  it('returns false when searchTerm is null', () => {
    const players = [{ value: 1, label: 'Alice' }];
    expect(hasExactMatch(players, null)).toBe(false);
  });

  it('returns false when no player matches the search term', () => {
    const players = [{ value: 1, label: 'Alice' }];
    expect(hasExactMatch(players, 'Bob')).toBe(false);
  });

  it('returns false for an empty player list', () => {
    expect(hasExactMatch([], 'Alice')).toBe(false);
  });
});

describe('filterPlayers', () => {
  const players = [
    { value: 1, label: 'Alice' },
    { value: 2, label: 'Bob' },
    { value: 3, label: 'Alberta' },
  ];

  it('filters out excluded players', () => {
    const result = filterPlayers(players, [{ value: 2, label: 'Bob' }], '');
    expect(result).toHaveLength(2);
    expect(result.map(p => p.value)).not.toContain(2);
  });

  it('applies search term filtering', () => {
    const result = filterPlayers(players, [], 'al');
    expect(result).toHaveLength(2);
    expect(result.map(p => p.label)).toEqual(['Alice', 'Alberta']);
  });

  it('applies both exclusion and search filtering together', () => {
    const result = filterPlayers(players, [{ value: 3, label: 'Alberta' }], 'al');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Alice');
  });

  it('returns all non-excluded players when search term is empty', () => {
    const result = filterPlayers(players, [], '');
    expect(result).toHaveLength(3);
  });

  it('returns empty array when all players are excluded', () => {
    const result = filterPlayers(players, players, '');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no players match the search term', () => {
    const result = filterPlayers(players, [], 'xyz');
    expect(result).toHaveLength(0);
  });

  it('performs case-insensitive search', () => {
    const result = filterPlayers(players, [], 'BOB');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Bob');
  });
});
