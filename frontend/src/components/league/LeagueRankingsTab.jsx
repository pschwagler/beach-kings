import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, Search } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
import RankingsTable from '../rankings/RankingsTable';
import { formatDateRange } from './utils/leagueUtils';

export default function LeagueRankingsTab() {
  const { 
    league,
    seasons,
    activeSeason, 
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    selectedPlayerId,
    selectedPlayerName,
    setSelectedPlayer,
    message,
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  // State for selected season (defaults to active season)
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  // State for player search filter
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');
  
  // Set initial selected season when activeSeason loads
  useEffect(() => {
    if (activeSeason?.id && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.id);
    }
  }, [activeSeason, selectedSeasonId]);
  
  // Get the currently selected season
  const selectedSeason = useMemo(() => {
    if (!selectedSeasonId || !seasons) return activeSeason;
    return seasons.find(s => s.id === selectedSeasonId) || activeSeason;
  }, [selectedSeasonId, seasons, activeSeason]);
  
  // Get data for the selected season
  const selectedSeasonData = useMemo(() => {
    if (!selectedSeason) return null;
    // Get data from seasonData map
    return seasonData[selectedSeason.id] || null;
  }, [selectedSeason, seasonData]);
  
  // Load season data when selected season changes
  useEffect(() => {
    if (selectedSeasonId && selectedSeasonId !== activeSeason?.id) {
      loadSeasonData(selectedSeasonId);
    }
  }, [selectedSeasonId, activeSeason, loadSeasonData]);

  // Get rankings from selected season data
  // Return null if rankings hasn't loaded yet (undefined), only return [] if explicitly empty array
  const allRankings = useMemo(() => {
    if (!selectedSeasonData) return null;
    // If rankings is undefined, data hasn't loaded yet - return null
    if (selectedSeasonData.rankings === undefined) return null;
    // If rankings is explicitly an array (even if empty), return it
    return Array.isArray(selectedSeasonData.rankings) ? selectedSeasonData.rankings : [];
  }, [selectedSeasonData]);
  
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
    activeSeason: selectedSeason,
    rankings,
  });

  if (!seasons || seasons.length === 0) {
    return (
      <div className="league-section">
        <div className="empty-state">
          <Trophy size={48} className="large-empty-state-icon" />
          <p>No seasons found. Please create a season to view rankings.</p>
        </div>
      </div>
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
            value={selectedSeasonId || ''}
            onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
            className="season-selector-dropdown"
          >
            {seasons.map(season => (
              <option key={season.id} value={season.id}>
                {season.name} {season.is_active ? '(Active)' : ''}
                {season.start_date && season.end_date ? ` - ${formatDateRange(season.start_date, season.end_date)}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <RankingsTable
        rankings={rankings}
        onPlayerClick={handlePlayerClick}
        loading={selectedSeasonId ? seasonDataLoadingMap[selectedSeasonId] : false}
      />
    </div>
  );
}

