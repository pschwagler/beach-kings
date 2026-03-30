import { useCallback, type RefObject } from 'react';
import { autoAdvanceToNextField } from '../../../utils/formNavigation';

/** A player option value: either an object with value/label or a string name. */
type PlayerOption = { value: number | string; label: string; [key: string]: unknown } | string | null;

/**
 * Hook to consolidate form field handlers
 * Groups handleFieldChange, handleScoreChange, and handlePlayerChange
 */
/** Minimal ref shape for form navigation — must support .focus() and .querySelector(). */
type FormFieldRef = RefObject<{ focus?: () => void; querySelector?: (selector: string) => HTMLElement | null } | null>;

interface UseMatchFormHandlersParams {
  dispatchForm: (action: { type: 'SET_PLAYER' | 'SET_SCORE'; field: string; player?: PlayerOption; value?: string }) => void;
  setFormError: (error: string | null) => void;
  team1Player2Ref: FormFieldRef;
  team2Player1Ref: FormFieldRef;
  team2Player2Ref: FormFieldRef;
  team1ScoreRef: FormFieldRef;
}

export function useMatchFormHandlers({
  dispatchForm,
  setFormError,
  team1Player2Ref,
  team2Player1Ref,
  team2Player2Ref,
  team1ScoreRef
}: UseMatchFormHandlersParams) {
  const handleFieldChange = useCallback((field: string, value: PlayerOption) => {
    dispatchForm({ type: 'SET_PLAYER', field, player: value });
    // Clear error when user starts typing
    setFormError(null);
  }, [dispatchForm, setFormError]);

  const handleScoreChange = useCallback((field: string, value: string) => {
    // Remove any non-numeric characters
    const numericValue = value.replace(/\D/g, '');
    
    // Limit to 2 digits
    let formattedValue = numericValue.slice(0, 2);
    
    // If empty, set to '00', otherwise pad with leading zero if needed
    if (!formattedValue) {
      formattedValue = '00';
    } else {
      formattedValue = formattedValue.padStart(2, '0');
    }
    
    dispatchForm({ type: 'SET_SCORE', field, value: formattedValue });
    // Clear error when user starts typing
    setFormError(null);
  }, [dispatchForm, setFormError]);

  const handlePlayerChange = useCallback((field: string, newPlayer: PlayerOption) => {
    // Clear error when user starts typing
    setFormError(null);
    
    // Update form with player (reducer handles duplicate removal)
    dispatchForm({ type: 'SET_PLAYER', field, player: newPlayer });
    
    // Auto-advance to next field after selection
    if (newPlayer) {
      const refs = {
        team1Player2Ref,
        team2Player1Ref,
        team2Player2Ref,
        team1ScoreRef
      };
      autoAdvanceToNextField(field, refs);
    }
  }, [dispatchForm, setFormError, team1Player2Ref, team2Player1Ref, team2Player2Ref, team1ScoreRef]);

  return {
    handleFieldChange,
    handleScoreChange,
    handlePlayerChange
  };
}

