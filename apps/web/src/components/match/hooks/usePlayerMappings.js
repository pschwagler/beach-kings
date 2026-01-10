import { useMemo } from 'react';

/**
 * Hook to consolidate all player mapping logic
 * Creates playerOptions, playerIdToNameMap, and playerNameToIdMap in one place
 */
export function usePlayerMappings({ members, allPlayerNames }) {
  const { playerOptions, playerIdToNameMap, playerNameToIdMap } = useMemo(() => {
    // Transform members into player options with value (player_id) and label (player_name)
    let options = [];
    if (!members || members.length === 0) {
      // Fallback to allPlayerNames if no members (backward compatibility)
      if (Array.isArray(allPlayerNames) && allPlayerNames.length > 0) {
        // Check if allPlayerNames are already in object format
        options = allPlayerNames.map(player => {
          if (typeof player === 'object' && 'value' in player && 'label' in player) {
            return player;
          }
          return { value: player, label: player };
        });
      }
    } else {
      options = members.map(member => ({
        value: member.player_id,
        label: member.player_name || `Player ${member.player_id}`
      }));
    }

    // Create maps from player_id to player_name and vice versa
    const idToNameMap = new Map();
    const nameToIdMap = new Map();
    
    if (members && members.length > 0) {
      members.forEach(member => {
        idToNameMap.set(member.player_id, member.player_name);
        nameToIdMap.set(member.player_name, member.player_id);
      });
    }

    return {
      playerOptions: options,
      playerIdToNameMap: idToNameMap,
      playerNameToIdMap: nameToIdMap
    };
  }, [members, allPlayerNames]);

  /**
   * Extract player ID from player option (handles both object and string formats)
   */
  const getPlayerId = useMemo(() => {
    return (playerOption, nameToIdMap = playerNameToIdMap) => {
      if (!playerOption) return null;
      
      // If it's an object with value/label, use the value (player_id)
      if (typeof playerOption === 'object' && 'value' in playerOption) {
        return playerOption.value;
      }
      
      // Legacy: if it's a string, try to find the ID from the map
      if (typeof playerOption === 'string') {
        return nameToIdMap.get(playerOption) || null;
      }
      
      return null;
    };
  }, [playerNameToIdMap]);

  return {
    playerOptions,
    playerIdToNameMap,
    playerNameToIdMap,
    getPlayerId
  };
}

