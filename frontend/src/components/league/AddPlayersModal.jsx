import { useState, useEffect, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import { getPlayers, addLeagueMember } from '../../services/api';
import { getPlayerDisplayName, matchesSearchTerm, ROLE_OPTIONS } from './utils/leagueUtils';

const INITIAL_PLAYERS_TO_SHOW = 10;

export default function AddPlayersModal({
  isOpen,
  leagueId,
  members,
  onClose,
  onSuccess,
  showMessage
}) {
  const [allPlayers, setAllPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]); // Array of {player_id, role}
  const [searchTerm, setSearchTerm] = useState('');

  // Load players when modal opens
  useEffect(() => {
    if (isOpen && allPlayers.length === 0 && !loadingPlayers) {
      const loadPlayers = async () => {
        setLoadingPlayers(true);
        try {
          const players = await getPlayers();
          setAllPlayers(players);
        } catch (err) {
          console.error('Error loading players:', err);
          showMessage?.('error', 'Failed to load players');
        } finally {
          setLoadingPlayers(false);
        }
      };
      loadPlayers();
    }
  }, [isOpen, allPlayers.length, loadingPlayers, showMessage]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPlayers([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  // Check if player is already a member or selected
  const isPlayerDisabled = useMemo(() => {
    const memberIds = new Set(members.map(m => m.player_id));
    const selectedIds = new Set(selectedPlayers.map(sp => sp.player_id));
    return (playerId) => memberIds.has(playerId) || selectedIds.has(playerId);
  }, [members, selectedPlayers]);

  // Available players (not members, not selected)
  const availablePlayers = useMemo(() => {
    return allPlayers.filter(player => !isPlayerDisabled(player.id));
  }, [allPlayers, isPlayerDisabled]);

  // Players to display based on search
  const playersToDisplay = useMemo(() => {
    // Selected players always shown at top
    const selectedList = selectedPlayers.map(sp => {
      const player = allPlayers.find(p => p.id === sp.player_id);
      return { ...sp, player, isSelected: true };
    }).filter(item => item.player); // Filter out any missing players

    // Available players based on search
    let availableList = [];
    if (searchTerm.trim()) {
      availableList = allPlayers
        .filter(p => matchesSearchTerm(p, searchTerm) && !isPlayerDisabled(p.id))
        .map(player => ({ player, isSelected: false }));
    } else {
      availableList = availablePlayers
        .slice(0, INITIAL_PLAYERS_TO_SHOW)
        .map(player => ({ player, isSelected: false }));
    }

    return [...selectedList, ...availableList];
  }, [selectedPlayers, allPlayers, searchTerm, availablePlayers, isPlayerDisabled]);

  const handleAddPlayer = (player) => {
    setSelectedPlayers(prev => [...prev, { player_id: player.id, role: 'member' }]);
    setSearchTerm('');
  };

  const handleRemovePlayer = (playerId) => {
    setSelectedPlayers(prev => prev.filter(sp => sp.player_id !== playerId));
  };

  const handleChangeRole = (playerId, newRole) => {
    setSelectedPlayers(prev =>
      prev.map(sp => sp.player_id === playerId ? { ...sp, role: newRole } : sp)
    );
  };

  const handleSubmit = async () => {
    if (selectedPlayers.length === 0) {
      showMessage?.('error', 'Please select at least one player');
      return;
    }

    try {
      for (const selectedPlayer of selectedPlayers) {
        await addLeagueMember(leagueId, selectedPlayer.player_id, selectedPlayer.role);
      }
      onSuccess();
      onClose();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to add players');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-players-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Players to League</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="add-players-search-section">
            <label htmlFor="player-search">Search Players</label>
            {loadingPlayers ? (
              <p>Loading players...</p>
            ) : (
              <input
                id="player-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Type to search for players..."
                className="form-input"
              />
            )}
          </div>

          <div className="add-players-table-section">
            {loadingPlayers ? (
              <p>Loading players...</p>
            ) : playersToDisplay.length === 0 ? (
              <p className="modal-hint">
                {searchTerm.trim()
                  ? `No players found matching "${searchTerm}"`
                  : 'All available players are already in this league.'}
              </p>
            ) : (
              <div className="add-players-table">
                {playersToDisplay.map((item) => {
                  const player = item.player;
                  const playerName = getPlayerDisplayName(player);
                  const isSelected = item.isSelected;

                  return (
                    <div
                      key={isSelected ? item.player_id : player.id}
                      className={`add-players-table-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => !isSelected && handleAddPlayer(player)}
                    >
                      <div className="add-players-table-name">{playerName}</div>
                      <div className="add-players-table-actions">
                        {isSelected ? (
                          <>
                            <select
                              value={item.role}
                              onChange={(e) => handleChangeRole(item.player_id, e.target.value)}
                              className="league-role-select"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ROLE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="add-players-table-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePlayer(item.player_id);
                              }}
                              title="Remove from selection"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="add-players-table-add"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddPlayer(player);
                            }}
                            title="Add to selection"
                          >
                            <Plus size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="league-text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="league-text-button primary"
            onClick={handleSubmit}
            disabled={selectedPlayers.length === 0}
          >
            Add Players
          </button>
        </div>
      </div>
    </div>
  );
}

