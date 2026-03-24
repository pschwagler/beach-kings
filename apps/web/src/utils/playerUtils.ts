/**
 * Utility functions for working with player objects
 */

interface PlayerOptionLike {
  value: any;
  label?: string;
}

interface RankedPlayer {
  Points: number;
  'Avg Pt Diff': number;
  'Win Rate': number;
  ELO: number;
  [key: string]: any;
}

/**
 * Get the value (ID) from a player object or string
 */
export function getPlayerValue(player: PlayerOptionLike | string | null | undefined): any {
  if (!player) return null;
  return player?.value ?? player;
}

/**
 * Check if two players are equal
 */
export function arePlayersEqual(a: any, b: any): boolean {
  if (!a || !b) return a === b;
  return getPlayerValue(a) === getPlayerValue(b);
}

/**
 * Remove duplicate player selections from form data
 * If the new player is already selected in another field, clear that field
 */
export function removeDuplicatePlayer(formData: Record<string, any>, currentField: string, newPlayer: any): Record<string, any> {
  const updated = { ...formData, [currentField]: newPlayer };
  const newPlayerValue = getPlayerValue(newPlayer);
  
  // Clear the player from other positions if they're already selected
  Object.keys(updated).forEach(key => {
    if (key !== currentField && key.includes('Player')) {
      const existingValue = getPlayerValue(updated[key]);
      if (existingValue === newPlayerValue) {
        updated[key] = '';
      }
    }
  });
  
  return updated;
}

/**
 * Convert player name to player option object
 */
export function nameToPlayerOption(name: string | null | undefined, nameToIdMap: Map<string, any>): PlayerOptionLike | string {
  if (!name) return '';
  const playerId = nameToIdMap.get(name);
  if (playerId) {
    return { value: playerId, label: name };
  }
  // Fallback: if name not found in map, return as object with name as both value and label
  return { value: name, label: name };
}

/**
 * Default player sorting with tie-breakers: Points → Avg Pt Diff → Win Rate → ELO
 */
export const sortPlayersDefault = (a: RankedPlayer, b: RankedPlayer): number => {
  if (a.Points !== b.Points) return b.Points - a.Points;
  if (a['Avg Pt Diff'] !== b['Avg Pt Diff']) return b['Avg Pt Diff'] - a['Avg Pt Diff'];
  if (a['Win Rate'] !== b['Win Rate']) return b['Win Rate'] - a['Win Rate'];
  return b.ELO - a.ELO;
};

/**
 * Get the first place player from rankings array
 * @param {Array} rankings - Array of player ranking objects
 * @returns {Object|null} - First place player or null if no rankings
 */
export const getFirstPlacePlayer = (rankings: RankedPlayer[] | null | undefined): RankedPlayer | null => {
  if (!rankings || rankings.length === 0) return null;
  return [...rankings].sort(sortPlayersDefault)[0];
};

/**
 * Check if a player profile is incomplete.
 * A profile is considered incomplete if it's missing required fields:
 * - gender (required for gendered divisions)
 * - level (required skill level)
 * - city (required for location matching)
 * 
 * @param {Object} player - The player object to check
 * @returns {boolean} True if profile is incomplete, false otherwise
 */
export function isProfileIncomplete(player: any): boolean {
  if (!player) {
    return true;
  }
  
  return !player.gender || !player.level || !player.city;
}
