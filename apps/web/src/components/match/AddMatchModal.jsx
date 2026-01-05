'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, ChevronDown, Settings } from 'lucide-react';
import { Button } from '../ui/UI';
import PlayerDropdown from '../player/PlayerDropdown';
import ConfirmationModal from '../modal/ConfirmationModal';
import { useMatchFormReducer } from './useMatchFormReducer';
import { nameToPlayerOption, arePlayersEqual } from '../../utils/playerUtils';
import { formatScore } from '../../utils/matchValidation';

// Import custom hooks
import { useLeagueSeasonSelection } from './hooks/useLeagueSeasonSelection';
import { useMatchFormUI } from './hooks/useMatchFormUI';
import { useFormSubmission } from './hooks/useFormSubmission';
import { usePlayerMappings } from './hooks/usePlayerMappings';
import { useMatchFormHandlers } from './hooks/useMatchFormHandlers';
import { useMatchValidation } from './hooks/useMatchValidation';
import { useMatchPayload } from './hooks/useMatchPayload';
import SeasonDropdown from './components/SeasonDropdown';

// Helper function to map edit match to form data
const mapEditMatchToFormData = (editMatch, nameToIdMap) => ({
  team1Player1: nameToPlayerOption(editMatch['Team 1 Player 1'] || '', nameToIdMap),
  team1Player2: nameToPlayerOption(editMatch['Team 1 Player 2'] || '', nameToIdMap),
  team2Player1: nameToPlayerOption(editMatch['Team 2 Player 1'] || '', nameToIdMap),
  team2Player2: nameToPlayerOption(editMatch['Team 2 Player 2'] || '', nameToIdMap),
  team1Score: formatScore(editMatch['Team 1 Score']),
  team2Score: formatScore(editMatch['Team 2 Score'])
});

export default function AddMatchModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  allPlayerNames = [], 
  onDelete, 
  editMatch = null,
  leagueMatchOnly = false,
  defaultLeagueId = null,
  members = [],
  league = null,
  sessionId = null,
  sessionSeasonId = null,
  defaultSeasonId = null,
  onSeasonChange = null
}) {
  const [formData, dispatchForm, INITIAL_FORM_STATE] = useMatchFormReducer();
  const [isRanked, setIsRanked] = useState(true);
  
  // Use custom hooks
  const leagueSeasonSelection = useLeagueSeasonSelection({
    isOpen,
    leagueMatchOnly,
    defaultLeagueId,
    league,
    sessionSeasonId,
    defaultSeasonId,
    matchType: leagueMatchOnly ? 'league' : 'non-league'
  });
  const {
    matchType,
    setMatchType,
    selectedLeagueId,
    setSelectedLeagueId,
    availableLeagues,
    activeSeason,
    allSeasons,
    selectedSeasonId,
    setSelectedSeasonId,
    setActiveSeason,
    hasActiveSession,
    isSeasonDisabled,
    loadingLeagues,
    loadingSeason,
    isSeasonActive
  } = leagueSeasonSelection;

  const formUI = useMatchFormUI();
  const {
    isLeagueDropdownOpen,
    setIsLeagueDropdownOpen,
    isSeasonDropdownOpen,
    setIsSeasonDropdownOpen,
    isConfigExpanded,
    setIsConfigExpanded,
    leagueDropdownRef,
    seasonDropdownRef
  } = formUI;

  const formSubmission = useFormSubmission();
  const {
    isSubmitting,
    setIsSubmitting,
    formError,
    setFormError,
    showDeleteConfirm,
    setShowDeleteConfirm
  } = formSubmission;
  
  // Refs for auto-focusing next fields
  const team1Player1Ref = useRef(null);
  const team1Player2Ref = useRef(null);
  const team2Player1Ref = useRef(null);
  const team2Player2Ref = useRef(null);
  const team1ScoreRef = useRef(null);
  const team2ScoreRef = useRef(null);

  // Use player mappings hook
  const playerMappings = usePlayerMappings({ members, allPlayerNames });
  const { playerOptions, playerNameToIdMap, getPlayerId } = playerMappings;

  // Use form handlers hook
  const formHandlers = useMatchFormHandlers({
    dispatchForm,
    setFormError,
    team1Player2Ref,
    team2Player1Ref,
    team2Player2Ref,
    team1ScoreRef
  });
  const { handleScoreChange, handlePlayerChange } = formHandlers;

  // Reset match type and ranked state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsRanked(true);
    }
  }, [isOpen]);

  // Track if modal is newly opened (for auto-open behavior) - derived state
  const shouldAutoOpen = useMemo(() => {
    return isOpen && !editMatch && leagueMatchOnly;
  }, [isOpen, editMatch, leagueMatchOnly]);

  // Pre-populate fields when editing
  useEffect(() => {
    if (editMatch) {
      dispatchForm({ 
        type: 'LOAD_MATCH', 
        formData: mapEditMatchToFormData(editMatch, playerNameToIdMap) 
      });
    } else {
      dispatchForm({ type: 'RESET' });
    }
    setFormError(null);
  }, [editMatch, isOpen, playerNameToIdMap]);

  // Open season dropdown and show error state when "Please select a season" error occurs
  useEffect(() => {
    if (formError === 'Please select a season' && !isSeasonDropdownOpen) {
      setIsSeasonDropdownOpen(true);
    }
  }, [formError, isSeasonDropdownOpen]);

  // Use validation hook
  const { validateForm } = useMatchValidation({
    formData,
    editMatch,
    matchType,
    selectedLeagueId,
    selectedSeasonId,
    allSeasons,
    setSelectedSeasonId,
    setActiveSeason,
    setFormError
  });

  // Use match payload hook
  const { buildMatchPayload } = useMatchPayload({
    matchType,
    selectedLeagueId,
    selectedSeasonId,
    allSeasons,
    sessionId,
    isRanked,
    getPlayerId,
    formData
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    const validationResult = validateForm();
    if (!validationResult.isValid) {
      return;
    }

    // Validate all player IDs are provided
    const team1_p1_id = getPlayerId(formData.team1Player1);
    const team1_p2_id = getPlayerId(formData.team1Player2);
    const team2_p1_id = getPlayerId(formData.team2Player1);
    const team2_p2_id = getPlayerId(formData.team2Player2);
    
    if (!team1_p1_id || !team1_p2_id || !team2_p1_id || !team2_p2_id) {
      setFormError('Please select all four players');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build match payload using the hook with validated scores
      const matchPayload = buildMatchPayload(validationResult.scoresValidation);

      await onSubmit(matchPayload, editMatch ? editMatch.id : null);

      // Reset form only if not editing (edit mode will close and reset via useEffect)
      if (!editMatch) {
        dispatchForm({ type: 'RESET' });
      }
      
      onClose();
    } catch (error) {
      console.error('Error submitting match:', error);
      setFormError('Failed to submit game. Please try again.');
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
      setFormError('Failed to delete game. Please try again.');
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
      return !arePlayersEqual(player, currentPlayer);
    });
  };

  // Determine winner based on scores
  const score1 = parseInt(formData.team1Score) || 0;
  const score2 = parseInt(formData.team2Score) || 0;
  const hasValidScores = !isNaN(score1) && !isNaN(score2) && score1 >= 0 && score2 >= 0;
  const team1IsWinner = hasValidScores && score1 > score2;
  const team2IsWinner = hasValidScores && score2 > score1;

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="add-match-modal-overlay">
      <div className="drawer-modal" onClick={(e) => e.stopPropagation()} data-testid="add-match-modal">
        <div className="modal-header">
          <h2>{editMatch ? 'Edit Game' : 'Add New Game'}</h2>
          <Button variant="close" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <form id="add-match-form" onSubmit={handleSubmit} className="add-match-form" data-testid="add-match-form">
          {formError && (
            <div className="form-error">
              {formError}
            </div>
          )}

          {/* Match Configuration Section - Collapsible */}
          {!editMatch && (
            <div className="match-config-section">
              <div className="match-config-header-row">
                <button 
                  type="button" 
                  className="match-config-toggle inline"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                >
                  <Settings size={16} strokeWidth={2.5} />
                  <span className="match-info-title">Game Info</span>
                </button>
                
                <button 
                  type="button" 
                  className="match-config-chevron-button"
                  onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                >
                  <ChevronDown size={16} className={`config-chevron ${isConfigExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
              
              {isConfigExpanded && (
                <div className="match-config-inline-controls">
                  <div className="match-type-toggle compact">
                    <button
                      type="button"
                      className={`match-type-option compact ${matchType === 'non-league' ? 'active' : ''}`}
                      onClick={() => {
                        if (!leagueMatchOnly) {
                          setMatchType('non-league');
                        }
                      }}
                      disabled={leagueMatchOnly}
                    >
                      Non-League
                    </button>
                    <button
                      type="button"
                      className={`match-type-option compact ${matchType === 'league' ? 'active' : ''}`}
                      onClick={() => setMatchType('league')}
                      disabled={leagueMatchOnly}
                    >
                      League
                    </button>
                  </div>

                  <div className="ranked-toggle-switch compact">
                    <button
                      type="button"
                      className={`ranked-toggle-option compact ${!isRanked ? 'active' : ''}`}
                      onClick={() => {
                        if (matchType === 'non-league') {
                          setIsRanked(false);
                        }
                      }}
                      disabled={matchType === 'league'}
                    >
                      Unranked
                    </button>
                    <button
                      type="button"
                      className={`ranked-toggle-option compact ${isRanked ? 'active' : ''}`}
                      onClick={() => {
                        if (matchType === 'non-league') {
                          setIsRanked(true);
                        }
                      }}
                      disabled={matchType === 'league'}
                    >
                      Ranked
                    </button>
                  </div>
                </div>
              )}
              
              {isConfigExpanded && matchType === 'league' && (
                <div className="match-config-item compact league-season-item">
                  <div className="league-season-combined-inline">
                    <div className="league-dropdown-container compact" ref={leagueDropdownRef}>
                      <div
                        className={`league-dropdown-trigger compact ${isLeagueDropdownOpen ? 'open' : ''} ${!selectedLeagueId ? 'placeholder' : ''} ${leagueMatchOnly ? 'disabled-look' : ''}`}
                        onClick={() => {
                          if (!leagueMatchOnly && availableLeagues.length > 0) {
                            setIsLeagueDropdownOpen(!isLeagueDropdownOpen);
                          }
                        }}
                        tabIndex={leagueMatchOnly ? -1 : 0}
                      >
                        <span>
                          {selectedLeagueId
                            ? availableLeagues.find(l => l.id === selectedLeagueId)?.name || 'Select league'
                            : loadingLeagues
                            ? 'Loading...'
                            : 'Select league'}
                        </span>
                        {!leagueMatchOnly && availableLeagues.length > 0 && (
                          <ChevronDown size={14} className={isLeagueDropdownOpen ? 'rotate-180' : ''} />
                        )}
                      </div>
                      {isLeagueDropdownOpen && availableLeagues.length > 0 && (
                        <div className="league-dropdown-menu">
                          {availableLeagues.map((league) => (
                            <div
                              key={league.id}
                              className={`league-dropdown-option ${selectedLeagueId === league.id ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedLeagueId(league.id);
                                setIsLeagueDropdownOpen(false);
                              }}
                            >
                              {league.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedLeagueId && (
                      <div className="season-dropdown-container compact" ref={seasonDropdownRef}>
                        <SeasonDropdown
                          loadingSeason={loadingSeason}
                          hasActiveSession={hasActiveSession}
                          allSeasons={allSeasons}
                          selectedSeasonId={selectedSeasonId}
                          isSeasonDisabled={isSeasonDisabled}
                          isSeasonDropdownOpen={isSeasonDropdownOpen}
                          setIsSeasonDropdownOpen={setIsSeasonDropdownOpen}
                          setSelectedSeasonId={setSelectedSeasonId}
                          setActiveSeason={setActiveSeason}
                          formError={formError}
                          setFormError={setFormError}
                          onSeasonChange={onSeasonChange}
                          isSeasonActive={isSeasonActive}
                          seasonDropdownRef={seasonDropdownRef}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="teams-container">
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
              autoOpenFirstPlayer={shouldAutoOpen}
            />

            <div className="vs-divider-column">VS</div>

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
          </div>

        </form>
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
          <Button type="submit" form="add-match-form" variant="success" disabled={isSubmitting}>
            {isSubmitting ? (editMatch ? 'Updating...' : 'Adding...') : (editMatch ? 'Update Game' : 'Add Game')}
          </Button>
        </div>
      </div>
      
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Game"
        message="Are you sure you want to delete this game? This action cannot be undone."
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
    <div className="scorecard-container" data-testid={`team-${teamNumber}-score-container`}>
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
        data-testid={`team-${teamNumber}-score-digit-1`}
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
        data-testid={`team-${teamNumber}-score-digit-2`}
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
  nextScoreRef,
  autoOpenFirstPlayer = false
}) {
  return (
    <div className={`team-section ${isWinner ? 'is-winner' : ''}`} data-testid={`team-${teamNumber}-section`}>
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
              autoOpen={autoOpenFirstPlayer}
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
