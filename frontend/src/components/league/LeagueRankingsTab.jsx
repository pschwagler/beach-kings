import { useMemo, useCallback } from 'react';
import { Trophy } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerSelection } from './hooks/usePlayerSelection';
import { useMessage } from './hooks/useMessage';
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
  const [message, showMessage] = useMessage(5000);

  // Get rankings from context
  // Return null if rankings hasn't loaded yet (undefined), only return [] if explicitly empty array
  const rankings = useMemo(() => {
    if (!activeSeasonData) return null;
    // If rankings is undefined, data hasn't loaded yet - return null
    if (activeSeasonData.rankings === undefined) return null;
    // If rankings is explicitly an array (even if empty), return it
    return Array.isArray(activeSeasonData.rankings) ? activeSeasonData.rankings : [];
  }, [activeSeasonData]);

  // Get all player names from rankings
  const allPlayerNames = useMemo(() => {
    if (!rankings || !Array.isArray(rankings)) return [];
    return rankings.map(r => r.Name) || [];
  }, [rankings]);

  // Auto-select player when rankings become available
  usePlayerSelection({
    currentUserPlayer,
    selectedPlayerId,
    setSelectedPlayer,
    activeSeasonData,
    activeSeason,
    rankings,
  });

  const handlePlayerClick = useCallback((playerId, playerName) => {
    setSelectedPlayer(playerId, playerName);
    setTimeout(() => setIsPlayerPanelOpen(true), 10);
  }, [setSelectedPlayer, setIsPlayerPanelOpen]);

  const handleSideTabClick = useCallback(() => {
    if (selectedPlayerId && playerSeasonStats) {
      setIsPlayerPanelOpen(true);
    } else if (rankings && Array.isArray(rankings) && rankings.length > 0) {
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
  }, [selectedPlayerId, playerSeasonStats, rankings, currentUserPlayer, handlePlayerClick, setIsPlayerPanelOpen]);

  const handleClosePlayer = useCallback(() => {
    setIsPlayerPanelOpen(false);
  }, [setIsPlayerPanelOpen]);

  const handlePlayerChange = useCallback((newPlayerName) => {
    // Find player by name in rankings
    if (!rankings || !Array.isArray(rankings)) return;
    const player = rankings.find(r => r.Name === newPlayerName);
    if (player && player.player_id) {
      setSelectedPlayer(player.player_id, newPlayerName);
    }
  }, [rankings, setSelectedPlayer]);

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


