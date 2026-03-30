import { describe, it, expect } from 'vitest';
import {
  getPlayerValue,
  arePlayersEqual,
  removeDuplicatePlayer,
  nameToPlayerOption,
  sortPlayersDefault,
  getFirstPlacePlayer,
  isProfileIncomplete,
} from '../playerUtils';

describe('getPlayerValue', () => {
  it('returns null for null input', () => {
    expect(getPlayerValue(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(getPlayerValue(undefined)).toBeNull();
  });

  it('returns the string itself when given a string', () => {
    expect(getPlayerValue('Alice')).toBe('Alice');
  });

  it('returns the value property from a player option object', () => {
    expect(getPlayerValue({ value: 5, label: 'X' })).toBe(5);
  });

  it('returns 0 when value is 0 (falsy but valid)', () => {
    expect(getPlayerValue({ value: 0, label: 'X' })).toBe(0);
  });
});

describe('arePlayersEqual', () => {
  it('returns true when both are null', () => {
    expect(arePlayersEqual(null, null)).toBe(true);
  });

  it('returns true when both are undefined', () => {
    expect(arePlayersEqual(undefined, undefined)).toBe(true);
  });

  it('returns false when one is null and the other is not', () => {
    expect(arePlayersEqual(null, 'Alice')).toBe(false);
    expect(arePlayersEqual('Alice', null)).toBe(false);
  });

  it('returns true for two equal strings', () => {
    expect(arePlayersEqual('Alice', 'Alice')).toBe(true);
  });

  it('returns false for two different strings', () => {
    expect(arePlayersEqual('Alice', 'Bob')).toBe(false);
  });

  it('returns true for two option objects with the same value', () => {
    expect(arePlayersEqual({ value: 1, label: 'Alice' }, { value: 1, label: 'Alice' })).toBe(true);
  });

  it('returns false for two option objects with different values', () => {
    expect(arePlayersEqual({ value: 1, label: 'Alice' }, { value: 2, label: 'Bob' })).toBe(false);
  });

  it('returns true when a string matches the value of an option object', () => {
    expect(arePlayersEqual('Alice', { value: 'Alice', label: 'Alice' })).toBe(true);
  });

  it('returns false when a string does not match the value of an option object', () => {
    expect(arePlayersEqual('Alice', { value: 'Bob', label: 'Bob' })).toBe(false);
  });
});

describe('removeDuplicatePlayer', () => {
  it('sets the currentField to the new player', () => {
    const formData = { team1Player1: 'Alice', team1Player2: '' };
    const result = removeDuplicatePlayer(formData, 'team1Player1', 'Bob');
    expect(result.team1Player1).toBe('Bob');
  });

  it('clears a duplicate Player field when the same player is assigned elsewhere', () => {
    const formData = { team1Player1: 'Alice', team1Player2: 'Alice' };
    const result = removeDuplicatePlayer(formData, 'team1Player1', 'Alice');
    expect(result.team1Player1).toBe('Alice');
    expect(result.team1Player2).toBe('');
  });

  it('clears all other Player fields that have the same value as the new player', () => {
    const formData = {
      team1Player1: '',
      team1Player2: 'Alice',
      team2Player1: 'Alice',
    };
    const result = removeDuplicatePlayer(formData, 'team1Player1', 'Alice');
    expect(result.team1Player1).toBe('Alice');
    expect(result.team1Player2).toBe('');
    expect(result.team2Player1).toBe('');
  });

  it('does not affect keys that do not include "Player"', () => {
    const formData = { team1Player1: '', team1Score: 21 };
    const result = removeDuplicatePlayer(formData, 'team1Player1', 'Alice');
    expect(result.team1Score).toBe(21);
  });

  it('does not clear currentField even if it matches itself', () => {
    const formData = { team1Player1: 'Alice', team1Player2: '' };
    const result = removeDuplicatePlayer(formData, 'team1Player1', 'Alice');
    expect(result.team1Player1).toBe('Alice');
  });

  it('works with player option objects', () => {
    const alice = { value: 1, label: 'Alice' };
    const formData = { team1Player1: '', team1Player2: alice };
    const result = removeDuplicatePlayer(formData, 'team1Player1', alice);
    expect(result.team1Player1).toBe(alice);
    expect(result.team1Player2).toBe('');
  });
});

describe('nameToPlayerOption', () => {
  it('returns empty string for null', () => {
    expect(nameToPlayerOption(null, new Map())).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(nameToPlayerOption(undefined, new Map())).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(nameToPlayerOption('', new Map())).toBe('');
  });

  it('returns an option with the mapped id when name is found in the map', () => {
    const map = new Map([['Alice', 42]]);
    expect(nameToPlayerOption('Alice', map)).toEqual({ value: 42, label: 'Alice' });
  });

  it('returns an option with name as value when name is not found in the map', () => {
    const map = new Map();
    expect(nameToPlayerOption('Bob', map)).toEqual({ value: 'Bob', label: 'Bob' });
  });
});

describe('sortPlayersDefault', () => {
  it('sorts by points descending first', () => {
    const a = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1200 };
    const b = { points: 20, avg_pt_diff: 5, win_rate: 0.8, elo: 1200 };
    expect(sortPlayersDefault(a, b)).toBeGreaterThan(0);
    expect(sortPlayersDefault(b, a)).toBeLessThan(0);
  });

  it('uses avg_pt_diff as tiebreaker when points are equal', () => {
    const a = { points: 10, avg_pt_diff: 3, win_rate: 0.8, elo: 1200 };
    const b = { points: 10, avg_pt_diff: 7, win_rate: 0.8, elo: 1200 };
    expect(sortPlayersDefault(a, b)).toBeGreaterThan(0);
    expect(sortPlayersDefault(b, a)).toBeLessThan(0);
  });

  it('uses win_rate as tiebreaker when points and avg_pt_diff are equal', () => {
    const a = { points: 10, avg_pt_diff: 5, win_rate: 0.5, elo: 1200 };
    const b = { points: 10, avg_pt_diff: 5, win_rate: 0.9, elo: 1200 };
    expect(sortPlayersDefault(a, b)).toBeGreaterThan(0);
    expect(sortPlayersDefault(b, a)).toBeLessThan(0);
  });

  it('uses elo as final tiebreaker', () => {
    const a = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1000 };
    const b = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1500 };
    expect(sortPlayersDefault(a, b)).toBeGreaterThan(0);
    expect(sortPlayersDefault(b, a)).toBeLessThan(0);
  });

  it('returns 0 when all fields are equal', () => {
    const a = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1200 };
    const b = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1200 };
    expect(sortPlayersDefault(a, b)).toBe(0);
  });
});

describe('getFirstPlacePlayer', () => {
  it('returns null for null input', () => {
    expect(getFirstPlacePlayer(null)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getFirstPlacePlayer([])).toBeNull();
  });

  it('returns the only player in a single-element array', () => {
    const player = { points: 10, avg_pt_diff: 5, win_rate: 0.8, elo: 1200 };
    expect(getFirstPlacePlayer([player])).toBe(player);
  });

  it('returns the player with the highest ranking from multiple players', () => {
    const first = { points: 30, avg_pt_diff: 5, win_rate: 0.9, elo: 1400 };
    const second = { points: 20, avg_pt_diff: 5, win_rate: 0.8, elo: 1300 };
    const third = { points: 10, avg_pt_diff: 3, win_rate: 0.5, elo: 1100 };
    expect(getFirstPlacePlayer([third, second, first])).toBe(first);
  });

  it('does not mutate the original rankings array', () => {
    const players = [
      { points: 10, avg_pt_diff: 1, win_rate: 0.5, elo: 1000 },
      { points: 30, avg_pt_diff: 5, win_rate: 0.9, elo: 1400 },
    ];
    const originalOrder = [...players];
    getFirstPlacePlayer(players);
    expect(players[0]).toBe(originalOrder[0]);
    expect(players[1]).toBe(originalOrder[1]);
  });
});

describe('isProfileIncomplete', () => {
  it('returns true for null', () => {
    expect(isProfileIncomplete(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isProfileIncomplete(undefined)).toBe(true);
  });

  it('returns true when gender is missing', () => {
    expect(isProfileIncomplete({ gender: null, level: 'A', city: 'San Diego' })).toBe(true);
    expect(isProfileIncomplete({ gender: '', level: 'A', city: 'San Diego' })).toBe(true);
  });

  it('returns true when level is missing', () => {
    expect(isProfileIncomplete({ gender: 'M', level: null, city: 'San Diego' })).toBe(true);
    expect(isProfileIncomplete({ gender: 'M', level: '', city: 'San Diego' })).toBe(true);
  });

  it('returns true when city is missing', () => {
    expect(isProfileIncomplete({ gender: 'M', level: 'A', city: null })).toBe(true);
    expect(isProfileIncomplete({ gender: 'M', level: 'A', city: '' })).toBe(true);
  });

  it('returns false when all required fields are present', () => {
    expect(isProfileIncomplete({ gender: 'M', level: 'A', city: 'San Diego' })).toBe(false);
  });
});
