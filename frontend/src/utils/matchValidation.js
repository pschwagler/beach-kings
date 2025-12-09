/**
 * Validation utilities for match forms
 */

/**
 * Format score as 2-digit string
 */
export function formatScore(score) {
  if (!score && score !== 0) return '00';
  const num = parseInt(score);
  if (isNaN(num)) return '00';
  // Clamp to 0-99 range
  const clamped = Math.max(0, Math.min(99, num));
  return clamped.toString().padStart(2, '0');
}

/**
 * Validate that all player fields are filled
 */
export function validatePlayers(formData) {
  if (!formData.team1Player1 || !formData.team1Player2 || 
      !formData.team2Player1 || !formData.team2Player2) {
    return { isValid: false, errorMessage: 'Please fill in all player fields' };
  }
  return { isValid: true, errorMessage: null };
}

/**
 * Validate that scores are valid numbers
 */
export function validateScoreFormat(formData) {
  const score1 = parseInt(formData.team1Score);
  const score2 = parseInt(formData.team2Score);
  
  if (isNaN(score1) || isNaN(score2)) {
    return { isValid: false, errorMessage: 'Please enter valid scores' };
  }
  
  return { isValid: true, errorMessage: null };
}

/**
 * Validate scores according to game rules
 */
export function validateScores(formData) {
  const score1 = parseInt(formData.team1Score);
  const score2 = parseInt(formData.team2Score);
  
  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    return { isValid: false, errorMessage: 'Please enter valid scores' };
  }
  
  if (score1 === score2) {
    return { isValid: false, errorMessage: 'Scores cannot be tied. There must be a winner.' };
  }
  
  if (score1 === 0 && score2 === 0) {
    return { isValid: false, errorMessage: 'Both scores cannot be zero' };
  }
  
  return { isValid: true, errorMessage: null, score1, score2 };
}

/**
 * Validate all form fields
 */
export function validateFormFields(formData) {
  // Check players
  const playersValidation = validatePlayers(formData);
  if (!playersValidation.isValid) return playersValidation;
  
  // Check score format
  const scoreFormatValidation = validateScoreFormat(formData);
  if (!scoreFormatValidation.isValid) return scoreFormatValidation;
  
  return { isValid: true, errorMessage: null };
}





