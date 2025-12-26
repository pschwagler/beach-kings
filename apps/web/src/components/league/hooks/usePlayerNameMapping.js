import { useState, useEffect, useCallback } from 'react';
import { getPlayers } from '../../../services/api';

/**
 * Hook to handle player name/id mapping logic
 * Handles nickname vs full_name and creates mapping structures
 */
export function usePlayerNameMapping({ leagueId, members }) {
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [playerNameToFullName, setPlayerNameToFullName] = useState(new Map());
  const [playerNameToId, setPlayerNameToId] = useState(new Map());

  // Load league player names for match creation (nickname if exists, else full_name)
  useEffect(() => {
    if (!leagueId) {
      setAllPlayerNames([]);
      setPlayerNameToFullName(new Map());
      setPlayerNameToId(new Map());
      return;
    }
    
    // If no members yet, wait for them to load
    if (!members?.length) {
      return;
    }
    
    const loadLeaguePlayers = async () => {
      try {
        // Get all players to access their full data (including nicknames)
        const allPlayersData = await getPlayers();
        
        // Create a map of player_id to player data for quick lookup
        const playerMap = new Map();
        allPlayersData.forEach(p => {
          playerMap.set(p.id, p);
        });
        
        // Create mapping from display name to full_name
        const nameMapping = new Map();
        const playerNameSet = new Set();
        
        // Get display names for league members (nickname if exists, else full_name)
        members.forEach(member => {
          const player = playerMap.get(member.player_id);
          if (!player) return;
          
          const fullName = player.full_name || `Player ${player.id}`;
          // Use nickname if exists, otherwise use full_name
          const displayName = player.nickname || fullName;
          
          // Map display name to full_name (for match submission)
          nameMapping.set(displayName, fullName);
          // Add display name to the set
          playerNameSet.add(displayName);
          
          // If player has a nickname, also add full_name to dropdown options
          // (so editing works when form shows full_name)
          if (player.nickname && player.nickname !== fullName) {
            nameMapping.set(fullName, fullName);
            playerNameSet.add(fullName);
          }
        });
        
        const leaguePlayerNames = Array.from(playerNameSet).sort((a, b) => a.localeCompare(b));
        
        // Create mapping from display name to player_id
        const nameToIdMapping = new Map();
        members.forEach(member => {
          const player = playerMap.get(member.player_id);
          if (!player) return;
          
          const fullName = player.full_name || `Player ${player.id}`;
          const displayName = player.nickname || fullName;
          
          // Map both display name and full name to player_id
          nameToIdMapping.set(displayName, member.player_id);
          if (player.nickname && player.nickname !== fullName) {
            nameToIdMapping.set(fullName, member.player_id);
          }
        });
        
        setAllPlayerNames(leaguePlayerNames);
        setPlayerNameToFullName(nameMapping);
        setPlayerNameToId(nameToIdMapping);
      } catch (err) {
        console.error('Error loading league players:', err);
        setAllPlayerNames([]);
        setPlayerNameToFullName(new Map());
        setPlayerNameToId(new Map());
      }
    };
    
    loadLeaguePlayers();
  }, [leagueId, members]);

  // Helper to get player ID from name using playerNameToId map
  const getPlayerIdFromMap = useCallback((playerName) => {
    return playerNameToId.get(playerName) || null;
  }, [playerNameToId]);

  return {
    allPlayerNames,
    playerNameToFullName,
    playerNameToId,
    getPlayerIdFromMap
  };
}


