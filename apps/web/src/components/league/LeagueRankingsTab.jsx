import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, Search, Plus } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
import RankingsTable from '../rankings/RankingsTable';
import { formatDateRange } from './utils/leagueUtils';
import CreateSeasonModal from './CreateSeasonModal';
import AddPlayersModal from './AddPlayersModal';

export default function LeagueRankingsTab() {
  const { 
    league,
    leagueId,
    seasons,
    members,
    isSeasonActive,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    loadAllSeasonsRankings,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeasonData,
    selectedPlayerId,
    selectedPlayerName,
    setSelectedPlayer,
    message,
    refreshSeasons,
    refreshMembers,
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  // State for player search filter
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  
  // Get the currently selected season (null if "All Seasons" is selected)
  const selectedSeason = useMemo(() => {
    if (!selectedSeasonId || !seasons) return null;
    return seasons.find(s => s.id === selectedSeasonId) || null;
  }, [selectedSeasonId, seasons]);
  
  // Use selectedSeasonData from context (computed once for consistency)
  // Season data loading is now handled automatically by LeagueContext when selectedSeasonId changes

  // Get rankings from selected season data or all seasons
  // Return null if rankings hasn't loaded yet (undefined), only return [] if explicitly empty array
  const allRankings = useMemo(() => {
    if (!selectedSeasonId) {
      // "All Seasons" selected - get from all-seasons key
      const allSeasonsData = seasonData['all-seasons'];
      if (!allSeasonsData) return null;
      if (allSeasonsData.rankings === undefined) return null;
      return Array.isArray(allSeasonsData.rankings) ? allSeasonsData.rankings : [];
    }
    
    if (!selectedSeasonData) return null;
    // If rankings is undefined, data hasn't loaded yet - return null
    if (selectedSeasonData.rankings === undefined) return null;
    // If rankings is explicitly an array (even if empty), return it
    return Array.isArray(selectedSeasonData.rankings) ? selectedSeasonData.rankings : [];
  }, [selectedSeasonData, selectedSeasonId, seasonData]);
  
  // Filter rankings by search term
  const rankings = useMemo(() => {
    if (!allRankings) return null;
    if (!playerSearchTerm.trim()) return allRankings;
    
    const searchLower = playerSearchTerm.toLowerCase();
    return allRankings.filter(player => 
      player.Name?.toLowerCase().includes(searchLower)
    );
  }, [allRankings, playerSearchTerm]);

  // Get all player names from rankings
  const allPlayerNames = useMemo(() => {
    if (!rankings || !Array.isArray(rankings)) return [];
    return rankings.map(r => r.Name) || [];
  }, [rankings]);

  // Helper to get player ID from name using rankings
  const getPlayerIdFromRankings = useCallback((playerName) => {
    if (!rankings || !Array.isArray(rankings)) return null;
    const player = rankings.find(r => r.Name === playerName);
    return player?.player_id || null;
  }, [rankings]);

  // Use shared hook for player details drawer logic with auto-selection
  const { handlePlayerClick, handlePlayerChange } = usePlayerDetailsDrawer({
    seasonData: selectedSeasonData,
    getPlayerId: getPlayerIdFromRankings,
    allPlayerNames,
    leagueName: league?.name,
    seasonName: selectedSeason?.name,
    selectedPlayerId,
    selectedPlayerName,
    setSelectedPlayer,
    autoSelect: true,
    currentUserPlayer,
    rankings,
    selectedSeasonId,
  });

  const handleCreateSeasonSuccess = async () => {
    await refreshSeasons();
    setShowCreateSeasonModal(false);
  };

  const handleAddPlayersSuccess = async () => {
    await refreshMembers();
    setShowAddPlayerModal(false);
  };

  // Check if there are less than 4 players
  const hasLessThanFourPlayers = !members || members.length < 4;

  // Show empty state if no seasons
  if (!seasons || seasons.length === 0) {
    return (
      <>
        <div className="league-section">
          <div className="empty-state">
            <Trophy size={48} className="large-empty-state-icon" />
            <p>No seasons found. Please create a season to view rankings.</p>
            <button 
              className="league-text-button primary" 
              onClick={() => setShowCreateSeasonModal(true)}
              style={{ marginTop: '16px' }}
            >
              <Plus size={16} />
              Create Season
            </button>
          </div>
        </div>
        <CreateSeasonModal
          isOpen={showCreateSeasonModal}
          onClose={() => setShowCreateSeasonModal(false)}
          onSuccess={handleCreateSeasonSuccess}
        />
      </>
    );
  }

  // Show message if less than 4 players
  if (hasLessThanFourPlayers) {
    return (
      <>
        <div className="league-section">
          <div className="empty-state">
            <Trophy size={48} className="large-empty-state-icon" />
            <p>This league has less than 4 registered players. Invite more players to begin logging league matches.</p>
            <button 
              className="league-text-button primary" 
              onClick={() => setShowAddPlayerModal(true)}
              style={{ marginTop: '16px' }}
            >
              <Plus size={16} />
              Add Players
            </button>
          </div>
        </div>
        <AddPlayersModal
          isOpen={showAddPlayerModal}
          members={members}
          onClose={() => setShowAddPlayerModal(false)}
          onSuccess={handleAddPlayersSuccess}
        />
      </>
    );
  }

  return (
    <div className="league-section">
      {message && (
        <div className={`league-message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {/* Filters Row */}
      <div className="rankings-filters-row">
        {/* Player Search */}
        <div className="player-search-wrapper">
          <Search size={16} className="player-search-icon" />
          <input
            type="text"
            placeholder="Search Player"
            value={playerSearchTerm}
            onChange={(e) => setPlayerSearchTerm(e.target.value)}
            className="player-search-input"
            id="rankings-player-search"
          />
        </div>
        
        {/* Season Selector */}
        <div className="season-selector-wrapper">
          <select
            id="season-select"
            data-testid="season-select"
            value={selectedSeasonId || ''}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSeasonId(value ? Number(value) : null);
            }}
            className="season-selector-dropdown"
          >
            <option value="">All Seasons</option>
            {seasons.map(season => (
              <option key={season.id} value={season.id}>
                {season.name} {isSeasonActive(season) ? '(Active)' : ''}
                {season.start_date && season.end_date ? ` - ${formatDateRange(season.start_date, season.end_date)}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <RankingsTable
        rankings={rankings}
        onPlayerClick={handlePlayerClick}
        loading={selectedSeasonId 
          ? (seasonDataLoadingMap[selectedSeasonId] || false)
          : (seasonDataLoadingMap['all-seasons'] || false)
        }
        isAllSeasons={!selectedSeasonId}
      />
      <CreateSeasonModal
        isOpen={showCreateSeasonModal}
        onClose={() => setShowCreateSeasonModal(false)}
        onSuccess={handleCreateSeasonSuccess}
      />
      <AddPlayersModal
        isOpen={showAddPlayerModal}
        members={members}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={handleAddPlayersSuccess}
      />
    </div>
  );
}
