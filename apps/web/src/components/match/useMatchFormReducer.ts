import { useReducer, type Dispatch } from 'react';
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

/** A player field can be an empty string, a plain name string, or a player option object. */
type PlayerField = string | { value: number | string; label?: string; isPlaceholder?: boolean; inviteUrl?: string; inviteToken?: string };

interface FormState {
  team1Player1: PlayerField;
  team1Player2: PlayerField;
  team2Player1: PlayerField;
  team2Player2: PlayerField;
  team1Score: string;
  team2Score: string;
}

interface FormAction {
  type: 'SET_PLAYER' | 'SET_SCORE' | 'RESET' | 'LOAD_MATCH';
  field?: string;
  player?: PlayerField;
  value?: string;
  formData?: FormState;
}

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_PLAYER':
      // If a player is selected, remove them from other positions
      if (action.player) {
        return removeDuplicatePlayer(state, action.field, action.player) as FormState;
      }
      return { ...state, [action.field]: action.player } as FormState;
      
    case 'SET_SCORE':
      return {
        ...state,
        [action.field]: formatScore(action.value)
      };
      
    case 'RESET':
      return INITIAL_FORM_STATE;
      
    case 'LOAD_MATCH':
      return action.formData as FormState;
      
    default:
      return state;
  }
}

/**
 * Custom hook for managing match form state with reducer
 * @returns {[FormState, Dispatch<FormAction>, FormState]} [state, dispatch, INITIAL_FORM_STATE]
 */
export function useMatchFormReducer(): [FormState, Dispatch<FormAction>, FormState] {
  const [state, dispatch] = useReducer(formReducer, INITIAL_FORM_STATE);

  return [state, dispatch, INITIAL_FORM_STATE];
}
