import { describe, it, expect } from 'vitest';
import {
  formatScore,
  validatePlayers,
  validateScoreFormat,
  validateScores,
  validateFormFields,
} from '../matchValidation.js';

describe('formatScore', () => {
  it('formats single-digit number with leading zero', () => {
    expect(formatScore(5)).toBe('05');
  });

  it('formats two-digit number without leading zero', () => {
    expect(formatScore(21)).toBe('21');
  });

  it('formats zero as "00"', () => {
    expect(formatScore(0)).toBe('00');
  });

  it('formats string number', () => {
    expect(formatScore('7')).toBe('07');
  });

  it('formats string "0" as "00"', () => {
    expect(formatScore('0')).toBe('00');
  });

  it('returns "00" for null', () => {
    expect(formatScore(null)).toBe('00');
  });

  it('returns "00" for undefined', () => {
    expect(formatScore(undefined)).toBe('00');
  });

  it('returns "00" for empty string', () => {
    expect(formatScore('')).toBe('00');
  });

  it('returns "00" for non-numeric string', () => {
    expect(formatScore('abc')).toBe('00');
  });

  it('clamps values above 99 to 99', () => {
    expect(formatScore(150)).toBe('99');
    expect(formatScore(100)).toBe('99');
  });

  it('clamps negative values to 00', () => {
    expect(formatScore(-5)).toBe('00');
  });

  it('formats max valid value 99', () => {
    expect(formatScore(99)).toBe('99');
  });

  it('handles numeric string that parses to large number', () => {
    expect(formatScore('200')).toBe('99');
  });
});

describe('validatePlayers', () => {
  const validFormData = {
    team1Player1: 'Alice',
    team1Player2: 'Bob',
    team2Player1: 'Carol',
    team2Player2: 'Dave',
  };

  it('returns valid when all player fields are filled', () => {
    const result = validatePlayers(validFormData);
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeNull();
  });

  it('returns invalid when team1Player1 is missing', () => {
    const result = validatePlayers({ ...validFormData, team1Player1: '' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns invalid when team1Player2 is missing', () => {
    const result = validatePlayers({ ...validFormData, team1Player2: null });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns invalid when team2Player1 is missing', () => {
    const result = validatePlayers({ ...validFormData, team2Player1: undefined });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns invalid when team2Player2 is missing', () => {
    const result = validatePlayers({ ...validFormData, team2Player2: '' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns invalid when all players are missing', () => {
    const result = validatePlayers({});
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('accepts non-empty string values as valid', () => {
    const result = validatePlayers({
      team1Player1: '1',
      team1Player2: '2',
      team2Player1: '3',
      team2Player2: '4',
    });
    expect(result.isValid).toBe(true);
  });
});

describe('validateScoreFormat', () => {
  it('returns valid for two numeric scores', () => {
    const result = validateScoreFormat({ team1Score: '21', team2Score: '15' });
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeNull();
  });

  it('returns valid for numeric number inputs', () => {
    const result = validateScoreFormat({ team1Score: 21, team2Score: 15 });
    expect(result.isValid).toBe(true);
  });

  it('returns invalid when team1Score is non-numeric', () => {
    const result = validateScoreFormat({ team1Score: 'abc', team2Score: '15' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('returns invalid when team2Score is non-numeric', () => {
    const result = validateScoreFormat({ team1Score: '21', team2Score: 'xyz' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('returns invalid when both scores are non-numeric', () => {
    const result = validateScoreFormat({ team1Score: '', team2Score: '' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('returns invalid when scores are undefined', () => {
    const result = validateScoreFormat({ team1Score: undefined, team2Score: undefined });
    expect(result.isValid).toBe(false);
  });

  it('returns valid for zero scores', () => {
    const result = validateScoreFormat({ team1Score: '0', team2Score: '21' });
    expect(result.isValid).toBe(true);
  });
});

describe('validateScores', () => {
  it('returns valid for a legitimate winning score', () => {
    const result = validateScores({ team1Score: '21', team2Score: '15' });
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeNull();
    expect(result.score1).toBe(21);
    expect(result.score2).toBe(15);
  });

  it('returns invalid for tied scores', () => {
    const result = validateScores({ team1Score: '15', team2Score: '15' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Scores cannot be tied. There must be a winner.');
  });

  it('returns invalid when both scores are zero', () => {
    const result = validateScores({ team1Score: '0', team2Score: '0' });
    expect(result.isValid).toBe(false);
    // 0 === 0 is caught by the tie check first
    expect(result.errorMessage).toBe('Scores cannot be tied. There must be a winner.');
  });

  it('returns invalid for negative scores', () => {
    const result = validateScores({ team1Score: '-1', team2Score: '15' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('returns invalid when scores are non-numeric', () => {
    const result = validateScores({ team1Score: 'abc', team2Score: '15' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('returns invalid when scores are empty strings', () => {
    const result = validateScores({ team1Score: '', team2Score: '' });
    expect(result.isValid).toBe(false);
  });

  it('returns valid when team2 wins', () => {
    const result = validateScores({ team1Score: '10', team2Score: '21' });
    expect(result.isValid).toBe(true);
    expect(result.score1).toBe(10);
    expect(result.score2).toBe(21);
  });

  it('returns valid when one score is zero (shutout)', () => {
    const result = validateScores({ team1Score: '21', team2Score: '0' });
    expect(result.isValid).toBe(true);
    expect(result.score1).toBe(21);
    expect(result.score2).toBe(0);
  });

  it('returns invalid when both are negative', () => {
    const result = validateScores({ team1Score: '-5', team2Score: '-3' });
    expect(result.isValid).toBe(false);
  });
});

describe('validateFormFields', () => {
  const validFormData = {
    team1Player1: 'Alice',
    team1Player2: 'Bob',
    team2Player1: 'Carol',
    team2Player2: 'Dave',
    team1Score: '21',
    team2Score: '15',
  };

  it('returns valid for fully valid form data', () => {
    const result = validateFormFields(validFormData);
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeNull();
  });

  it('returns player error when players are missing', () => {
    const result = validateFormFields({ ...validFormData, team1Player1: '' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns score format error when scores are invalid', () => {
    const result = validateFormFields({ ...validFormData, team1Score: 'bad' });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please enter valid scores');
  });

  it('prioritizes player validation over score validation', () => {
    const result = validateFormFields({
      team1Player1: '',
      team1Player2: '',
      team2Player1: '',
      team2Player2: '',
      team1Score: 'bad',
      team2Score: 'bad',
    });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Please fill in all player fields');
  });

  it('returns valid when scores are 0 and numeric (format only, not rules)', () => {
    // validateFormFields only checks format (is it a number?), not game rules
    const result = validateFormFields({ ...validFormData, team1Score: '0', team2Score: '0' });
    expect(result.isValid).toBe(true);
  });
});
