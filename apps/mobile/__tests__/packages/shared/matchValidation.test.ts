import {
  MATCH_SCORE_VALIDATION_MESSAGES,
  validateMatchScore,
} from '@beach-kings/shared';

describe('validateMatchScore', () => {
  it.each([
    [0, 0, 'empty', MATCH_SCORE_VALIDATION_MESSAGES.empty],
    [5, 5, 'tied', MATCH_SCORE_VALIDATION_MESSAGES.tied],
    [21, 21, 'tied', MATCH_SCORE_VALIDATION_MESSAGES.tied],
  ])(
    'rejects %i-%i with an actionable validation result',
    (team1Score, team2Score, code, message) => {
      expect(validateMatchScore(team1Score, team2Score)).toEqual({
        isValid: false,
        errorMessage: message,
        code,
      });
    },
  );

  it.each([
    [1, 0],
    [21, 20],
    [22, 20],
    [23, 21],
    [21, 15],
  ])('accepts the untied score %i-%i', (team1Score, team2Score) => {
    expect(validateMatchScore(team1Score, team2Score)).toEqual({
      isValid: true,
      errorMessage: null,
      code: null,
      score1: team1Score,
      score2: team2Score,
    });
  });
});
