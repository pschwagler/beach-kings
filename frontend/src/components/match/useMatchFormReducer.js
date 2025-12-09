import { useReducer } from 'react';
import { removeDuplicatePlayer } from '../../utils/playerUtils';
import { formatScore } from '../../utils/matchValidation';

const INITIAL_FORM_STATE = {
  team1Player1: '',
  team1Player2: '',
  team2Player1: '',
  team2Player2: '',
  team1Score: '00',
  team2Score: '00'
};

function formReducer(state, action) {
  switch (action.type) {
    case 'SET_PLAYER':
      // If a player is selected, remove them from other positions
      if (action.player) {
        return removeDuplicatePlayer(state, action.field, action.player);
      }
      return { ...state, [action.field]: action.player };
      
    case 'SET_SCORE':
      return {
        ...state,
        [action.field]: formatScore(action.value)
      };
      
    case 'RESET':
      return INITIAL_FORM_STATE;
      
    case 'LOAD_MATCH':
      return action.formData;
      
    default:
      return state;
  }
}

/**
 * Custom hook for managing match form state with reducer
 * @returns {Array} [state, dispatch, INITIAL_FORM_STATE]
 */
export function useMatchFormReducer() {
  const [state, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE);
  
  return [state, dispatch, INITIAL_FORM_STATE];
}





