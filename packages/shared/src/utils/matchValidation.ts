/**
 * Validation utilities for match forms.
 */

interface ValidationResult {
  isValid: boolean;
  errorMessage: string | null;
}

interface ScoreValidationResult extends ValidationResult {
  score1?: number;
  score2?: number;
}

export type MatchScoreValidationCode = 'invalid' | 'empty' | 'tied' | null;

export interface MatchScoreValidationResult extends ScoreValidationResult {
  readonly code: MatchScoreValidationCode;
}

export const MATCH_SCORE_VALIDATION_MESSAGES = {
  invalid: 'Please enter valid scores.',
  empty: 'Enter a score before saving.',
  tied: 'Choose a winner by changing one score. Games cannot end in a tie.',
} as const;

interface MatchFormData {
  readonly team1Player1?: string | number | null;
  readonly team1Player2?: string | number | null;
  readonly team2Player1?: string | number | null;
  readonly team2Player2?: string | number | null;
  readonly team1Score?: string | number;
  readonly team2Score?: string | number;
  readonly [key: string]: unknown;
}

/**
 * Format score as 2-digit string.
 */
export function formatScore(score: string | number | null | undefined): string {
  if (!score && score !== 0) return '00';
  const num = parseInt(String(score));
  if (isNaN(num)) return '00';
  const clamped = Math.max(0, Math.min(99, num));
  return clamped.toString().padStart(2, '0');
}

/**
 * Validate that all player fields are filled.
 */
export function validatePlayers(formData: MatchFormData): ValidationResult {
  if (!formData.team1Player1 || !formData.team1Player2 ||
      !formData.team2Player1 || !formData.team2Player2) {
    return { isValid: false, errorMessage: 'Please fill in all player fields' };
  }
  return { isValid: true, errorMessage: null };
}

/**
 * Validate that scores are valid numbers.
 */
export function validateScoreFormat(formData: MatchFormData): ValidationResult {
  const score1 = parseInt(String(formData.team1Score));
  const score2 = parseInt(String(formData.team2Score));

  if (isNaN(score1) || isNaN(score2)) {
    return { isValid: false, errorMessage: 'Please enter valid scores' };
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Validate scores according to game rules.
 */
export function validateScores(formData: MatchFormData): ScoreValidationResult {
  return validateMatchScore(formData.team1Score, formData.team2Score);
}

/**
 * Validate a final game score independently of any form or screen.
 *
 * Generic games do not carry a target score, so low untied scores remain
 * valid here. Callers may present a non-blocking "incomplete" warning, but
 * every completed game must have a winner.
 */
export function validateMatchScore(
  team1Score: string | number | null | undefined,
  team2Score: string | number | null | undefined,
): MatchScoreValidationResult {
  const score1 = parseInt(String(team1Score));
  const score2 = parseInt(String(team2Score));

  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    return {
      isValid: false,
      errorMessage: MATCH_SCORE_VALIDATION_MESSAGES.invalid,
      code: 'invalid',
    };
  }

  if (score1 === 0 && score2 === 0) {
    return {
      isValid: false,
      errorMessage: MATCH_SCORE_VALIDATION_MESSAGES.empty,
      code: 'empty',
    };
  }

  if (score1 === score2) {
    return {
      isValid: false,
      errorMessage: MATCH_SCORE_VALIDATION_MESSAGES.tied,
      code: 'tied',
    };
  }

  return { isValid: true, errorMessage: null, code: null, score1, score2 };
}

/**
 * Validate all form fields.
 */
export function validateFormFields(formData: MatchFormData): ValidationResult {
  const playersValidation = validatePlayers(formData);
  if (!playersValidation.isValid) return playersValidation;

  const scoreFormatValidation = validateScoreFormat(formData);
  if (!scoreFormatValidation.isValid) return scoreFormatValidation;

  return { isValid: true, errorMessage: null };
}
