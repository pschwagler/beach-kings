import { useEffect } from 'react';

/**
 * Hook for auto-selecting a player when data becomes available
 * Attempts to select the current user's player, falls back to first player
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.currentUserPlayer - Current user's player object
 * @param {Object} options.selectedPlayerId - Currently selected player ID
 * @param {Function} options.setSelectedPlayer - Function to set selected player (playerId, playerName)
 * @param {Object} options.activeSeasonData - Active season data
 * @param {Object} options.activeSeason - Active season object
 * @param {Array} options.rankings - Optional: Rankings array for rankings tab
 * @param {Array} options.allPlayerNames - Optional: Array of player names for matches tab
 * @param {Map} options.playerNameToId - Optional: Map from player name to ID for matches tab
 * @param {Array} options.members - Optional: League members array for matches tab
 */
export function usePlayerSelection({
  currentUserPlayer,
  selectedPlayerId,
  setSelectedPlayer,
  activeSeasonData,
  activeSeason,
  rankings = null,
  allPlayerNames = null,
  playerNameToId = null,
  members = null,
}) {
  useEffect(() => {
    // Don't auto-select if already selected
    if (selectedPlayerId) return;
    
    // Need season data to proceed
    if (!activeSeasonData?.player_season_stats || !activeSeasonData?.partnership_opponent_stats || !activeSeason) return;

    // Case 1: Rankings-based selection (for RankingsTab)
    if (rankings && rankings.length > 0) {
      let playerToSelect = null;
      
      // Try to find current user's player in rankings first
      if (currentUserPlayer?.id) {
        const currentUserInRankings = rankings.find(r => r.player_id === currentUserPlayer.id);
        if (currentUserInRankings?.player_id) {
          playerToSelect = currentUserInRankings;
        }
      }
      
      // Fall back to first place player if current user not found
      if (!playerToSelect) {
        playerToSelect = rankings[0]; // Rankings are already sorted
      }
      
      if (playerToSelect?.player_id) {
        setSelectedPlayer(playerToSelect.player_id, playerToSelect.Name);
        // Don't auto-open the panel - let user click to open it
      }
      return;
    }

    // Case 2: Player names-based selection (for MatchesTab)
    if (allPlayerNames && allPlayerNames.length > 0 && playerNameToId && playerNameToId.size > 0) {
      let playerToSelect = null;
      let playerNameToSelect = null;
      
      // Try to find current user's player in the league
      if (currentUserPlayer?.id && members) {
        // Check if current user is a member
        const userMember = members.find(m => m.player_id === currentUserPlayer.id);
        if (userMember) {
          // Find the display name for this player
          const playerName = allPlayerNames.find(name => {
            const id = playerNameToId.get(name);
            return id === currentUserPlayer.id;
          });
          
          if (playerName) {
            playerToSelect = currentUserPlayer.id;
            playerNameToSelect = playerName;
          }
        }
      }
      
      // Fall back to first player if current user not found
      if (!playerToSelect && allPlayerNames.length > 0) {
        const firstName = allPlayerNames[0];
        const firstId = playerNameToId.get(firstName);
        if (firstId) {
          playerToSelect = firstId;
          playerNameToSelect = firstName;
        }
      }
      
      if (playerToSelect && playerNameToSelect) {
        setSelectedPlayer(playerToSelect, playerNameToSelect);
        // Don't auto-open the panel - let user click to open it
      }
    }
  }, [
    currentUserPlayer,
    selectedPlayerId,
    setSelectedPlayer,
    activeSeasonData,
    activeSeason,
    rankings,
    allPlayerNames,
    playerNameToId,
    members,
  ]);
}


