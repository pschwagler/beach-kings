import { useState, useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/UI';
import PlayerDropdown from '../player/PlayerDropdown';
import ConfirmationModal from '../modal/ConfirmationModal';
import { useLeague } from '../../contexts/LeagueContext';

// Constants
const INITIAL_FORM_STATE = {
  team1Player1: '',
  team1Player2: '',
  team2Player1: '',
  team2Player2: '',
  team1Score: '00',
  team2Score: '00'
};

// Helper function to convert player name to player option (for editing)
const nameToPlayerOption = (name, nameToIdMap) => {
  if (!name) return '';
  const playerId = nameToIdMap.get(name);
  if (playerId) {
    return { value: playerId, label: name };
  }
  // Fallback: if name not found in map, return as object with name as both value and label
  return { value: name, label: name };
};

// Helper function to format score as 2-digit string
const formatScore = (score) => {
  if (!score && score !== 0) return '00';
  const num = parseInt(score);
  if (isNaN(num)) return '00';
  // Clamp to 0-99 range
  const clamped = Math.max(0, Math.min(99, num));
  return clamped.toString().padStart(2, '0');
};

// Helper functions
const mapEditMatchToFormData = (editMatch, nameToIdMap) => ({
  team1Player1: nameToPlayerOption(editMatch['Team 1 Player 1'] || '', nameToIdMap),
  team1Player2: nameToPlayerOption(editMatch['Team 1 Player 2'] || '', nameToIdMap),
  team2Player1: nameToPlayerOption(editMatch['Team 2 Player 1'] || '', nameToIdMap),
  team2Player2: nameToPlayerOption(editMatch['Team 2 Player 2'] || '', nameToIdMap),
  team1Score: formatScore(editMatch['Team 1 Score']),
  team2Score: formatScore(editMatch['Team 2 Score'])
});

const validateFormFields = (formData) => {
  if (!formData.team1Player1 || !formData.team1Player2 || !formData.team2Player1 || !formData.team2Player2) {
    return { isValid: false, errorMessage: 'Please fill in all player fields' };
  }
  // Scores are always present (default to '00'), so we just need to validate they're valid numbers
  const score1 = parseInt(formData.team1Score);
  const score2 = parseInt(formData.team2Score);
  if (isNaN(score1) || isNaN(score2)) {
    return { isValid: false, errorMessage: 'Please enter valid scores' };
  }
  return { isValid: true, errorMessage: null };
};

const validateScores = (formData) => {
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
};

export default function AddMatchModal({ isOpen, onClose, onSubmit, allPlayerNames = [], onCreatePlayer, onDelete, editMatch = null }) {
  const { members } = useLeague();
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Refs for auto-focusing next fields
  const team1Player1Ref = useRef(null);
  const team1Player2Ref = useRef(null);
  const team2Player1Ref = useRef(null);
  const team2Player2Ref = useRef(null);
  const team1ScoreRef = useRef(null);
  const team2ScoreRef = useRef(null);

  // Transform members into player options with value (player_id) and label (player_name)
  const playerOptions = useMemo(() => {
    if (!members || members.length === 0) {
      // Fallback to allPlayerNames if no members (backward compatibility)
      if (Array.isArray(allPlayerNames) && allPlayerNames.length > 0) {
        // Check if allPlayerNames are already in object format
        return allPlayerNames.map(player => {
          if (typeof player === 'object' && 'value' in player && 'label' in player) {
            return player;
          }
          return { value: player, label: player };
        });
      }
      return [];
    }
    
    return members.map(member => ({
      value: member.player_id,
      label: member.player_name || `Player ${member.player_id}`
    }));
  }, [members, allPlayerNames]);

  // Create a map from player_id to player_name for conversion
  const playerIdToNameMap = useMemo(() => {
    const map = new Map();
    if (members && members.length > 0) {
      members.forEach(member => {
        map.set(member.player_id, member.player_name);
      });
    }
    return map;
  }, [members]);

  // Create a map from player_name to player_id for editing (when editMatch has names)
  const playerNameToIdMap = useMemo(() => {
    const map = new Map();
    if (members && members.length > 0) {
      members.forEach(member => {
        map.set(member.player_name, member.player_id);
      });
    }
    return map;
  }, [members]);

  // Handle any field change
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formError) setFormError(null);
  };

  // Handle score change - ensure it's always 2 digits
  const handleScoreChange = (field, value) => {
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
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
    // Clear error when user starts typing
    if (formError) setFormError(null);
  };

  // Helper to get player value (ID) from player option
  const getPlayerValue = (player) => {
    if (!player) return '';
    if (typeof player === 'object' && 'value' in player) {
      return player.value;
    }
    return player;
  };

  // Helper to check if two players are equal
  const playersEqual = (a, b) => {
    if (!a || !b) return a === b;
    const valA = getPlayerValue(a);
    const valB = getPlayerValue(b);
    return valA === valB;
  };

  // Handle player selection with duplicate prevention and auto-advance
  const handlePlayerChange = (field, newPlayer) => {
    // Clear error when user starts typing
    if (formError) setFormError(null);
    
    // If a player is selected, remove them from other positions
    if (newPlayer) {
      setFormData(prev => {
        const updated = { ...prev, [field]: newPlayer };
        const newPlayerValue = getPlayerValue(newPlayer);
        
        // Clear the player from other positions if they're already selected
        Object.keys(updated).forEach(key => {
          if (key !== field && key.includes('Player')) {
            const existingValue = getPlayerValue(updated[key]);
            if (existingValue === newPlayerValue) {
              updated[key] = '';
            }
          }
        });
        return updated;
      });
      
      // Auto-advance to next field after selection
      setTimeout(() => {
        switch (field) {
          case 'team1Player1':
            // Find the trigger element in the next dropdown and focus it
            const trigger2 = team1Player2Ref.current?.querySelector('.player-dropdown-trigger');
            if (trigger2) {
              trigger2.focus();
              // Open the dropdown
              trigger2.click();
            }
            break;
          case 'team1Player2':
            const trigger3 = team2Player1Ref.current?.querySelector('.player-dropdown-trigger');
            if (trigger3) {
              trigger3.focus();
              trigger3.click();
            }
            break;
          case 'team2Player1':
            const trigger4 = team2Player2Ref.current?.querySelector('.player-dropdown-trigger');
            if (trigger4) {
              trigger4.focus();
              trigger4.click();
            }
            break;
          case 'team2Player2':
            team1ScoreRef.current?.focus();
            break;
          default:
            break;
        }
      }, 100);
    } else {
      setFormData(prev => ({ ...prev, [field]: newPlayer }));
    }
  };

  // Pre-populate fields when editing
  useEffect(() => {
    if (editMatch) {
      setFormData(mapEditMatchToFormData(editMatch, playerNameToIdMap));
    } else {
      setFormData(INITIAL_FORM_STATE);
    }
    setFormError(null);
  }, [editMatch, isOpen, playerNameToIdMap]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields
    const fieldsValidation = validateFormFields(formData);
    if (!fieldsValidation.isValid) {
      setFormError(fieldsValidation.errorMessage);
      return;
    }

    // Validate scores
    const scoresValidation = validateScores(formData);
    if (!scoresValidation.isValid) {
      setFormError(scoresValidation.errorMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert player options (with player_id) to player names for API
      const getPlayerName = (playerOption) => {
        if (!playerOption) return '';
        
        // If it's an object with value/label, get the name from the map or use label
        if (typeof playerOption === 'object' && 'value' in playerOption) {
          const playerId = playerOption.value;
          const playerName = playerIdToNameMap.get(playerId);
          // If found in map, use it; otherwise use label (for new players)
          return playerName || playerOption.label || '';
        }
        
        // Legacy: if it's a string, return as-is
        return playerOption;
      };

      // Submit the match with player names (API expects names)
      await onSubmit({
        team1_player1: getPlayerName(formData.team1Player1),
        team1_player2: getPlayerName(formData.team1Player2),
        team2_player1: getPlayerName(formData.team2Player1),
        team2_player2: getPlayerName(formData.team2Player2),
        team1_score: scoresValidation.score1,
        team2_score: scoresValidation.score2
      }, editMatch ? editMatch.id : null);

      // Reset form only if not editing (edit mode will close and reset via useEffect)
      if (!editMatch) {
        setFormData(INITIAL_FORM_STATE);
      }
      
      onClose();
    } catch (error) {
      console.error('Error submitting match:', error);
      setFormError('Failed to submit match. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editMatch || !onDelete) return;
    
    setIsSubmitting(true);
    try {
      await onDelete(editMatch.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Error deleting match:', error);
      setFormError('Failed to delete match. Please try again.');
      setShowDeleteConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Get list of selected players for each dropdown to exclude
  const getExcludedPlayers = (currentPlayer) => {
    const allSelected = [formData.team1Player1, formData.team1Player2, formData.team2Player1, formData.team2Player2];
    return allSelected.filter(player => {
      if (!player) return false;
      return !playersEqual(player, currentPlayer);
    });
  };

  // Determine winner based on scores
  const score1 = parseInt(formData.team1Score) || 0;
  const score2 = parseInt(formData.team2Score) || 0;
  const hasValidScores = !isNaN(score1) && !isNaN(score2) && score1 >= 0 && score2 >= 0;
  const team1IsWinner = hasValidScores && score1 > score2;
  const team2IsWinner = hasValidScores && score2 > score1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editMatch ? 'Edit Match' : 'Add New Match'}</h2>
          <Button variant="close" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="add-match-form">
          {formError && (
            <div className="form-error">
              {formError}
            </div>
          )}

          <TeamSection
            teamNumber={1}
            player1Value={formData.team1Player1}
            player2Value={formData.team1Player2}
            scoreValue={formData.team1Score}
            player1Field="team1Player1"
            player2Field="team1Player2"
            scoreField="team1Score"
            isWinner={team1IsWinner}
            onPlayerChange={handlePlayerChange}
            onScoreChange={handleScoreChange}
            allPlayerNames={playerOptions}
            getExcludedPlayers={getExcludedPlayers}
            player1Ref={team1Player1Ref}
            player2Ref={team1Player2Ref}
            scoreRef={team1ScoreRef}
            nextScoreRef={team2ScoreRef}
          />

          <div className="vs-divider">VS</div>

          <TeamSection
            teamNumber={2}
            player1Value={formData.team2Player1}
            player2Value={formData.team2Player2}
            scoreValue={formData.team2Score}
            player1Field="team2Player1"
            player2Field="team2Player2"
            scoreField="team2Score"
            isWinner={team2IsWinner}
            onPlayerChange={handlePlayerChange}
            onScoreChange={handleScoreChange}
            allPlayerNames={playerOptions}
            getExcludedPlayers={getExcludedPlayers}
            player1Ref={team2Player1Ref}
            player2Ref={team2Player2Ref}
            scoreRef={team2ScoreRef}
            nextScoreRef={null}
          />

          <div className="modal-actions">
            {editMatch && onDelete && (
              <button 
                type="button" 
                onClick={handleDeleteClick} 
                disabled={isSubmitting}
                className="delete-match-text-btn"
              >
                Delete match
              </button>
            )}
            <Button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={isSubmitting}>
              {isSubmitting ? (editMatch ? 'Updating...' : 'Adding...') : (editMatch ? 'Update Match' : 'Add Match')}
            </Button>
          </div>
        </form>
      </div>
      
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Match"
        message="Are you sure you want to delete this match? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
}

// ScoreCard Input Component - Two separate digit inputs
function ScoreCardInput({ value, onChange, teamNumber, scoreRef, nextScoreRef }) {
  const formattedValue = formatScore(value);
  const digit1 = formattedValue[0] || '0';
  const digit2 = formattedValue[1] || '0';
  
  const isTeam1 = teamNumber === 1;
  const bgColor = isTeam1 ? '#dc2626' : '#2563eb'; // red-600 : blue-600
  
  const input1Ref = useRef(null);
  const input2Ref = useRef(null);
  
  // Expose focus method via ref
  useEffect(() => {
    if (scoreRef) {
      scoreRef.current = {
        focus: () => input1Ref.current?.focus()
      };
    }
  }, [scoreRef]);
  
  const handleDigitChange = (position, inputValue) => {
    // Remove non-numeric characters and get the last character (for paste support)
    const numericValue = inputValue.replace(/\D/g, '');
    const lastDigit = numericValue.slice(-1) || '0';
    
    if (position === 1) {
      // First digit changed
      const newValue = lastDigit + digit2;
      onChange(newValue);
      // Auto-advance to second digit if a number was entered
      if (lastDigit !== '0' && numericValue.length > 0) {
        setTimeout(() => {
          input2Ref.current?.focus();
        }, 10);
      }
    } else {
      // Second digit changed
      const newValue = digit1 + lastDigit;
      onChange(newValue);
      // Auto-advance to next score input after second digit is entered
      if (numericValue.length > 0 && nextScoreRef) {
        setTimeout(() => {
          nextScoreRef.current?.focus();
        }, 10);
      }
    }
  };
  
  const handleKeyDown = (e, position) => {
    const keyCode = e.keyCode || e.which;
    const key = e.key;
    
    // Handle arrow keys for navigation
    if (keyCode === 37) { // Left arrow
      e.preventDefault();
      if (position === 2) {
        e.target.previousSibling?.focus();
      }
      return;
    } else if (keyCode === 39) { // Right arrow
      e.preventDefault();
      if (position === 1) {
        e.target.nextSibling?.focus();
      }
      return;
    }
    
    // Handle backspace - clear current digit and move left if at second position
    if (keyCode === 8 || key === 'Backspace') {
      e.preventDefault();
      if (position === 2) {
        handleDigitChange(2, '0');
      } else if (position === 1) {
        handleDigitChange(1, '0');
      }
      return;
    }
    
    // Handle delete - clear current digit
    if (keyCode === 46 || key === 'Delete') {
      e.preventDefault();
      handleDigitChange(position, '0');
      return;
    }
    
    // Allow tab, escape, enter
    if ([9, 27, 13].indexOf(keyCode) !== -1) {
      return;
    }
    
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((keyCode === 65 || keyCode === 67 || keyCode === 86 || keyCode === 88) && (e.ctrlKey || e.metaKey)) {
      return;
    }
    
    // Check if it's a number key
    const isNumber = (keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105);
    
    // If input has a value and a number is pressed, replace and advance
    if (isNumber && e.target.value.length === 1) {
      e.preventDefault();
      handleDigitChange(position, key);
      return;
    }
    
    // Block non-numeric characters (numbers will be handled by onChange)
    if (!isNumber) {
      e.preventDefault();
    }
  };
  
  const handleFocus = (e) => {
    // Select all text when focused for easy replacement
    setTimeout(() => {
      e.target.select();
    }, 0);
  };
  
  return (
    <div className="scorecard-container">
      <input
        ref={input1Ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={1}
        value={digit1}
        onChange={(e) => handleDigitChange(1, e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, 1)}
        onFocus={handleFocus}
        className="scorecard-digit-input"
        style={{ backgroundColor: bgColor }}
        aria-label={`Team ${teamNumber} score first digit`}
      />
      <input
        ref={input2Ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={1}
        value={digit2}
        onChange={(e) => handleDigitChange(2, e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        onFocus={handleFocus}
        className="scorecard-digit-input"
        style={{ backgroundColor: bgColor }}
        aria-label={`Team ${teamNumber} score second digit`}
      />
    </div>
  );
}

// Internal component to reduce duplication
function TeamSection({ 
  teamNumber, 
  player1Value, 
  player2Value, 
  scoreValue,
  player1Field,
  player2Field,
  scoreField,
  isWinner, 
  onPlayerChange, 
  onScoreChange,
  allPlayerNames,
  getExcludedPlayers,
  player1Ref,
  player2Ref,
  scoreRef,
  nextScoreRef
}) {
  return (
    <div className="team-section">
      <div className="team-header">
        <h3>Team {teamNumber}</h3>
        {isWinner && (
          <div className="winner-badge">
            Winner
          </div>
        )}
      </div>
      <div className="team-inputs-row">
        <div className="player-inputs">
          <div ref={player1Ref}>
            <PlayerDropdown
              value={player1Value}
              onChange={(player) => onPlayerChange(player1Field, player)}
              allPlayerNames={allPlayerNames || []}
              placeholder="Player 1"
              excludePlayers={getExcludedPlayers(player1Value)}
            />
          </div>
          <div ref={player2Ref}>
            <PlayerDropdown
              value={player2Value}
              onChange={(player) => onPlayerChange(player2Field, player)}
              allPlayerNames={allPlayerNames || []}
              placeholder="Player 2"
              excludePlayers={getExcludedPlayers(player2Value)}
            />
          </div>
        </div>
        <ScoreCardInput
          value={scoreValue}
          onChange={(value) => onScoreChange(scoreField, value)}
          teamNumber={teamNumber}
          scoreRef={scoreRef}
          nextScoreRef={nextScoreRef}
        />
      </div>
    </div>
  );
}
