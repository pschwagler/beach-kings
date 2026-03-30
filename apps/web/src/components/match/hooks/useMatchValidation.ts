import { useCallback } from 'react';
import { validateFormFields, validateScores } from '../../../utils/matchValidation';

/** A player option as produced by usePlayerMappings or the form reducer. */
type PlayerOption = { value: number | string; label?: string; [key: string]: unknown } | string | null;

/** Form data for the match form. */
interface MatchFormData {
  team1Player1?: PlayerOption;
  team1Player2?: PlayerOption;
  team2Player1?: PlayerOption;
  team2Player2?: PlayerOption;
  team1Score?: string;
  team2Score?: string;
}

/** Minimal season shape for selection. */
interface SeasonOption {
  id: number;
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Hook to handle match form validation
 * Consolidates validation logic for fields, scores, league, and season
 */
interface UseMatchValidationParams {
  formData: MatchFormData;
  editMatch: unknown;
  matchType: string;
  selectedLeagueId: number | null | undefined;
  selectedSeasonId: number | null | undefined;
  allSeasons: SeasonOption[];
  setSelectedSeasonId: (id: number | null) => void;
  setActiveSeason: (season: SeasonOption | null) => void;
  setFormError: (error: string | null) => void;
}

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
}: UseMatchValidationParams) {
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
        return { isValid: false, openSeasonDropdown: true };
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

