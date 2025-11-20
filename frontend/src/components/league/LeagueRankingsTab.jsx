import { useState, useEffect, useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import RankingsTable from '../rankings/RankingsTable';
import PlayerDetailsPanel from '../player/PlayerDetailsPanel';

export default function LeagueRankingsTab() {
  const { 
    league,
    activeSeason, 
    activeSeasonData, 
    seasonDataLoading,
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    isPlayerPanelOpen,
    setIsPlayerPanelOpen,
    setSelectedPlayer
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const [message, setMessage] = useState(null);

  // Get rankings from context
  const rankings = useMemo(() => {
    return activeSeasonData?.rankings || [];
  }, [activeSeasonData]);

  // Get all player names from rankings
  const allPlayerNames = useMemo(() => {
    return rankings.map(r => r.Name) || [];
  }, [rankings]);


  // Auto-load current user's player data when rankings are available (but don't open panel)
  // Falls back to first place player if current user is not in rankings
  useEffect(() => {
    if (rankings.length > 0 && !selectedPlayerId && activeSeasonData?.player_season_stats && activeSeasonData?.partnership_opponent_stats && activeSeason) {
      let playerToSelect = null;
      
      // Try to find current user's player in rankings first
      if (currentUserPlayer && currentUserPlayer.id) {
        const currentUserInRankings = rankings.find(r => r.player_id === currentUserPlayer.id);
        if (currentUserInRankings && currentUserInRankings.player_id) {
          playerToSelect = currentUserInRankings;
        }
      }
      
      // Fall back to first place player if current user not found
      if (!playerToSelect) {
        playerToSelect = rankings[0]; // Rankings are already sorted
      }
      
      if (playerToSelect && playerToSelect.player_id) {
        setSelectedPlayer(playerToSelect.player_id, playerToSelect.Name);
        // Don't auto-open the panel - let user click to open it
      }
    }
  }, [rankings, activeSeasonData, activeSeason, selectedPlayerId, setSelectedPlayer, currentUserPlayer]);

  const handlePlayerClick = (playerId, playerName) => {
    setSelectedPlayer(playerId, playerName);
    setTimeout(() => setIsPlayerPanelOpen(true), 10);
  };

  const handleSideTabClick = () => {
    if (selectedPlayerId && playerSeasonStats) {
      setIsPlayerPanelOpen(true);
    } else if (rankings.length > 0) {
      // Try to find current user's player first
      let playerToSelect = null;
      if (currentUserPlayer && currentUserPlayer.id) {
        const currentUserInRankings = rankings.find(r => r.player_id === currentUserPlayer.id);
        if (currentUserInRankings && currentUserInRankings.player_id) {
          playerToSelect = currentUserInRankings;
        }
      }
      
      // Fall back to first place player if current user not found
      if (!playerToSelect) {
        playerToSelect = rankings[0];
      }
      
      if (playerToSelect && playerToSelect.player_id) {
        handlePlayerClick(playerToSelect.player_id, playerToSelect.Name);
      }
    }
  };

  const handleClosePlayer = () => {
    setIsPlayerPanelOpen(false);
  };

  const handlePlayerChange = (newPlayerName) => {
    // Find player by name in rankings
    const player = rankings.find(r => r.Name === newPlayerName);
    if (player && player.player_id) {
      setSelectedPlayer(player.player_id, newPlayerName);
    }
  };

  // Show message alert
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!activeSeason) {
    return (
      <div className="league-section">
        <div className="empty-state">
          <Trophy size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p>No active season found. Please create an active season to view rankings.</p>
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
      
      <RankingsTable
        rankings={rankings}
        onPlayerClick={handlePlayerClick}
        loading={seasonDataLoading}
      />

      <PlayerDetailsPanel
        selectedPlayer={selectedPlayerName}
        playerStats={playerSeasonStats}
        playerMatchHistory={playerMatchHistory}
        isPanelOpen={isPlayerPanelOpen}
        allPlayerNames={allPlayerNames}
        onPlayerChange={handlePlayerChange}
        onClose={handleClosePlayer}
        onSideTabClick={handleSideTabClick}
        leagueName={league?.name}
        seasonName={activeSeason?.name}
      />
    </div>
  );
}


