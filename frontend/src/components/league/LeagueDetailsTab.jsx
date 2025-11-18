import { useState, useEffect, useMemo } from 'react';
import { Calendar, Users, Edit2, Plus, X } from 'lucide-react';
import { Button } from '../ui/UI';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { getPlayers, getLocations, addLeagueMember, createLeagueSeason, updateLeague } from '../../services/api';

const LEVEL_OPTIONS = [
  { value: '', label: 'Select skill level' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'Open', label: 'Open' }
];

export default function LeagueDetailsTab({ leagueId, showMessage }) {
  const { league, members, seasons, refreshMembers, refreshSeasons, updateLeague: updateLeagueInContext } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  const [allPlayers, setAllPlayers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [description, setDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [seasonFormData, setSeasonFormData] = useState({
    name: '',
    start_date: '',
    end_date: ''
  });

  // Compute isAdmin from context
  const isAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    const userMember = members.find(m => m.player_id === currentUserPlayer.id);
    return userMember?.role === 'admin';
  }, [currentUserPlayer, members]);

  // Load locations on mount (needed for league info display)
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const locationsData = await getLocations();
        setLocations(locationsData);
      } catch (err) {
        console.error('Error loading locations:', err);
      }
    };
    loadLocations();
  }, []);

  // Load players only when the add player modal is opened
  useEffect(() => {
    if (showAddPlayerModal && allPlayers.length === 0 && !loadingPlayers) {
      const loadPlayers = async () => {
        setLoadingPlayers(true);
        try {
          const players = await getPlayers();
          setAllPlayers(players);
        } catch (err) {
          console.error('Error loading players:', err);
        } finally {
          setLoadingPlayers(false);
        }
      };
      loadPlayers();
    }
  }, [showAddPlayerModal, allPlayers.length, loadingPlayers]);

  // Update description when league changes
  useEffect(() => {
    if (league) {
      setDescription(league.description || '');
    }
  }, [league]);

  const availablePlayers = useMemo(() => {
    return allPlayers.filter(
      player => !members.some(member => member.player_id === player.id)
    );
  }, [allPlayers, members]);

  const handleEditDescription = () => {
    setIsEditingDescription(true);
    setDescription(league?.description || '');
  };

  const handleCancelEditDescription = () => {
    setIsEditingDescription(false);
    setDescription(league?.description || '');
  };

  const handleSaveDescription = async () => {
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: description.trim() || null,
        level: league?.level || null,
        location_id: league?.location_id || null,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });
      
      updateLeagueInContext(updatedLeague);
      setIsEditingDescription(false);
      showMessage?.('success', 'Description updated successfully');
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update description');
    }
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayerId) {
      showMessage?.('error', 'Please select a player');
      return;
    }

    try {
      await addLeagueMember(leagueId, parseInt(selectedPlayerId));
      showMessage?.('success', 'Player added to league successfully');
      setShowAddPlayerModal(false);
      setSelectedPlayerId('');
      await refreshMembers();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to add player');
    }
  };

  const handleCreateSeason = async () => {
    if (!seasonFormData.start_date || !seasonFormData.end_date) {
      showMessage?.('error', 'Start date and end date are required');
      return;
    }

    try {
      await createLeagueSeason(leagueId, {
        name: seasonFormData.name || undefined,
        start_date: seasonFormData.start_date,
        end_date: seasonFormData.end_date
      });
      showMessage?.('success', 'Season created successfully');
      setShowCreateSeasonModal(false);
      setSeasonFormData({ name: '', start_date: '', end_date: '' });
      await refreshSeasons();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create season');
    }
  };

  if (!league) {
    return <div className="loading">Loading league details...</div>;
  }

  return (
    <>
      <div className="league-section">
        {/* Description Section */}
        <div className="league-section" style={{ marginBottom: '40px' }}>
          <div className="section-header">
            <h2 className="section-title">Description</h2>
            {isAdmin && !isEditingDescription && (
              <Button 
                variant="success" 
                size="small"
                onClick={handleEditDescription}
              >
                <Edit2 size={16} />
                Edit
              </Button>
            )}
          </div>
          
          {isEditingDescription ? (
            <div className="form-section">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-input"
                rows={4}
                placeholder="League description"
              />
              <div className="form-actions" style={{ marginTop: '12px' }}>
                <Button onClick={handleCancelEditDescription}>
                  Cancel
                </Button>
                <Button variant="success" onClick={handleSaveDescription}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="info-display">
              {league.description ? (
                <p>{league.description}</p>
              ) : (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No description</p>
              )}
            </div>
          )}
        </div>

        {/* Players Section */}
        <div className="league-section" style={{ marginBottom: '40px' }}>
          <div className="section-header">
            <h2 className="section-title">
              <Users size={20} />
              Players
            </h2>
            {isAdmin && (
              <Button 
                variant="success" 
                size="small"
                onClick={() => setShowAddPlayerModal(true)}
              >
                <Plus size={16} />
                Add Player
              </Button>
            )}
          </div>
          
          {members.length === 0 ? (
            <div className="empty-state">
              <Users size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>No players yet.</p>
            </div>
          ) : (
            <div className="members-list">
              {members.map((member) => (
                <div key={member.id} className="member-card">
                  <div className="member-info">
                    <h3>{member.player_name || `Player ${member.player_id}`}</h3>
                    <p className="member-role">{member.role}</p>
                  </div>
                  {member.role === 'admin' && (
                    <span className="member-badge admin">Admin</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seasons Section */}
        <div className="league-section" style={{ marginBottom: '40px' }}>
          <div className="section-header">
            <h2 className="section-title">
              <Calendar size={20} />
              Seasons
            </h2>
            {isAdmin && (
              <Button 
                variant="success" 
                size="small"
                onClick={() => setShowCreateSeasonModal(true)}
              >
                <Plus size={16} />
                New Season
              </Button>
            )}
          </div>
          
          {seasons.length === 0 ? (
            <div className="empty-state">
              <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>No seasons yet.</p>
            </div>
          ) : (
            <div className="seasons-list">
              {seasons.map((season) => (
                <div key={season.id} className="season-card">
                  <div className="season-info">
                    <h3>{season.name || `Season ${season.id}`}</h3>
                    <p className="season-dates">
                      {new Date(season.start_date).toLocaleDateString()} - {new Date(season.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  {season.is_active && (
                    <span className="season-badge active">Active</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* League Info Section */}
        <div className="league-section">
          <h2 className="section-title">League Information</h2>
          <div className="info-display">
            <div className="info-row">
              <strong>Access:</strong> {league.is_open ? 'Open' : 'Invite Only'}
            </div>
            {league.level && (
              <div className="info-row">
                <strong>Skill Level:</strong> {LEVEL_OPTIONS.find(opt => opt.value === league.level)?.label || league.level}
              </div>
            )}
            {league.location_id && (
              <div className="info-row">
                <strong>Location:</strong> {locations.find(loc => loc.id === league.location_id)?.name || `Location ${league.location_id}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Player Modal */}
      {showAddPlayerModal && (
        <div className="modal-overlay" onClick={() => setShowAddPlayerModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Player to League</h2>
              <Button variant="close" onClick={() => setShowAddPlayerModal(false)}>
                <X size={20} />
              </Button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="player-select">Select Player</label>
                {loadingPlayers ? (
                  <p>Loading players...</p>
                ) : (
                  <select
                    id="player-select"
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="form-input form-select"
                  >
                    <option value="">Choose a player...</option>
                    {availablePlayers.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.full_name || player.nickname || `Player ${player.id}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {!loadingPlayers && availablePlayers.length === 0 && (
                <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
                  All available players are already in this league.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <Button onClick={() => setShowAddPlayerModal(false)}>Cancel</Button>
              <Button 
                variant="success" 
                onClick={handleAddPlayer}
                disabled={!selectedPlayerId || availablePlayers.length === 0}
              >
                Add Player
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Season Modal */}
      {showCreateSeasonModal && (
        <div className="modal-overlay" onClick={() => setShowCreateSeasonModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Season</h2>
              <Button variant="close" onClick={() => setShowCreateSeasonModal(false)}>
                <X size={20} />
              </Button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="season-name">Season Name (Optional)</label>
                <input
                  id="season-name"
                  type="text"
                  value={seasonFormData.name}
                  onChange={(e) => setSeasonFormData({ ...seasonFormData, name: e.target.value })}
                  placeholder="e.g., Spring 2024"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="season-start-date">
                  Start Date <span className="required">*</span>
                </label>
                <input
                  id="season-start-date"
                  type="date"
                  value={seasonFormData.start_date}
                  onChange={(e) => setSeasonFormData({ ...seasonFormData, start_date: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="season-end-date">
                  End Date <span className="required">*</span>
                </label>
                <input
                  id="season-end-date"
                  type="date"
                  value={seasonFormData.end_date}
                  onChange={(e) => setSeasonFormData({ ...seasonFormData, end_date: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setShowCreateSeasonModal(false)}>Cancel</Button>
              <Button 
                variant="success" 
                onClick={handleCreateSeason}
                disabled={!seasonFormData.start_date || !seasonFormData.end_date}
              >
                Create Season
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

