import { useCallback } from 'react';
import { autoAdvanceToNextField } from '../../../utils/formNavigation';

/**
 * Hook to consolidate form field handlers
 * Groups handleFieldChange, handleScoreChange, and handlePlayerChange
 */
export function useMatchFormHandlers({
  dispatchForm,
  setFormError,
  team1Player2Ref,
  team2Player1Ref,
  team2Player2Ref,
  team1ScoreRef
}) {
  const handleFieldChange = useCallback((field, value) => {
    dispatchForm({ type: 'SET_PLAYER', field, player: value });
    // Clear error when user starts typing
    setFormError(null);
  }, [dispatchForm, setFormError]);

  const handleScoreChange = useCallback((field, value) => {
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

  const handlePlayerChange = useCallback((field, newPlayer) => {
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
