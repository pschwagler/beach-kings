import { useCallback } from 'react';
import { validateFormFields, validateScores } from '../../../utils/matchValidation';

/**
 * Hook to handle match form validation
 * Consolidates validation logic for fields, scores, league, and season
 */
export function useMatchValidation({
  formData,
  editMatch,
  matchType,
  selectedLeagueId,
  selectedSeasonId,
  allSeasons,
  setSelectedSeasonId,
  setActiveSeason,
  setFormError
}) {
  const validateForm = useCallback(() => {
    // Validate all fields
    const fieldsValidation = validateFormFields(formData);
    if (!fieldsValidation.isValid) {
      setFormError(fieldsValidation.errorMessage);
      return { isValid: false };
    }

    // Validate scores
    const scoresValidation = validateScores(formData);
    if (!scoresValidation.isValid) {
      setFormError(scoresValidation.errorMessage);
      return { isValid: false };
    }

    // Validate league selection for league matches
    if (!editMatch && matchType === 'league' && !selectedLeagueId) {
      setFormError('Please select a league');
      return { isValid: false };
    }

    // Validate season selection for league matches
    if (!editMatch && matchType === 'league' && selectedLeagueId) {
      if (allSeasons.length > 1 && !selectedSeasonId) {
        setFormError('Please select a season');
        return { isValid: false };
      }
      if (allSeasons.length === 1 && !selectedSeasonId) {
        // Auto-select the single season
        setSelectedSeasonId(allSeasons[0].id);
        setActiveSeason(allSeasons[0]);
      }
    }

    return { isValid: true, scoresValidation };
  }, [
    formData,
    editMatch,
    matchType,
    selectedLeagueId,
    selectedSeasonId,
    allSeasons,
    setSelectedSeasonId,
    setActiveSeason,
    setFormError
  ]);

  return { validateForm };
}
