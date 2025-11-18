import { useState, useEffect, useMemo } from 'react';
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
  team1Score: '',
  team2Score: ''
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

// Helper functions
const mapEditMatchToFormData = (editMatch, nameToIdMap) => ({
  team1Player1: nameToPlayerOption(editMatch['Team 1 Player 1'] || '', nameToIdMap),
  team1Player2: nameToPlayerOption(editMatch['Team 1 Player 2'] || '', nameToIdMap),
  team2Player1: nameToPlayerOption(editMatch['Team 2 Player 1'] || '', nameToIdMap),
  team2Player2: nameToPlayerOption(editMatch['Team 2 Player 2'] || '', nameToIdMap),
  team1Score: editMatch['Team 1 Score']?.toString() || '',
  team2Score: editMatch['Team 2 Score']?.toString() || ''
});

const validateFormFields = (formData) => {
  if (!formData.team1Player1 || !formData.team1Player2 || !formData.team2Player1 || !formData.team2Player2 || !formData.team1Score || !formData.team2Score) {
    return { isValid: false, errorMessage: 'Please fill in all fields' };
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

  // Handle player selection with duplicate prevention
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
      }, editMatch ? editMatch['Match ID'] : null);

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
      await onDelete(editMatch['Match ID']);
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
  const score1 = parseInt(formData.team1Score);
  const score2 = parseInt(formData.team2Score);
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

        {editMatch && onDelete && (
          <div className="delete-match-link">
            <button 
              type="button" 
              onClick={handleDeleteClick} 
              disabled={isSubmitting}
              className="delete-match-text-btn"
            >
              Delete match
            </button>
          </div>
        )}

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
            onScoreChange={handleFieldChange}
            allPlayerNames={playerOptions}
            getExcludedPlayers={getExcludedPlayers}
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
            onScoreChange={handleFieldChange}
            allPlayerNames={playerOptions}
            getExcludedPlayers={getExcludedPlayers}
          />

          <div className="modal-actions">
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
  getExcludedPlayers
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
          <PlayerDropdown
            value={player1Value}
            onChange={(player) => onPlayerChange(player1Field, player)}
            allPlayerNames={allPlayerNames || []}
            placeholder="Player 1"
            excludePlayers={getExcludedPlayers(player1Value)}
          />
          <PlayerDropdown
            value={player2Value}
            onChange={(player) => onPlayerChange(player2Field, player)}
            allPlayerNames={allPlayerNames || []}
            placeholder="Player 2"
            excludePlayers={getExcludedPlayers(player2Value)}
          />
        </div>
        <input
          type="number"
          min="0"
          value={scoreValue}
          onChange={(e) => onScoreChange(scoreField, e.target.value)}
          placeholder="0"
          className="score-input"
          required
        />
      </div>
    </div>
  );
}
