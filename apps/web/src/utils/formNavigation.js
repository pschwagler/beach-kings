/**
 * Form navigation utilities for auto-advancing between fields
 */

const FIELD_NAVIGATION = {
  team1Player1: 'team1Player2',
  team1Player2: 'team2Player1',
  team2Player1: 'team2Player2',
  team2Player2: 'team1Score',
};

/**
 * Auto-advance to the next field after selection
 * @param {string} currentField - The field that was just filled
 * @param {Object} refs - Object containing refs for all fields
 */
export function autoAdvanceToNextField(currentField, refs) {
  const nextField = FIELD_NAVIGATION[currentField];
  if (!nextField) return;
  
  setTimeout(() => {
    const refKey = `${nextField}Ref`;
    const ref = refs[refKey];
    
    if (!ref?.current) return;
    
    // Check if the NEXT field is a player field (not the current field)
    if (nextField.includes('Player')) {
      // For player fields, find the input inside the dropdown
      const input = ref.current.querySelector('.player-dropdown-input');
      if (input) {
        input.focus();
      }
    } else {
      // For score fields, focus directly
      ref.current.focus();
    }
  }, 100);
}

