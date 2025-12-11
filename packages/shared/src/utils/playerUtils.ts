/**
 * Utility functions for working with player objects
 */

import type { Player, PlayerOption } from '../types';

/**
 * Get the value (ID) from a player object or string
 */
export function getPlayerValue(player: PlayerOption | string | number | null | undefined): number | string | null {
  if (!player) return null;
  if (typeof player === 'object' && 'value' in player) {
    return player.value;
  }
  return player as number | string;
}

/**
 * Check if two players are equal
 */
export function arePlayersEqual(a: PlayerOption | string | number | null, b: PlayerOption | string | number | null): boolean {
  if (!a || !b) return a === b;
  return getPlayerValue(a) === getPlayerValue(b);
}

/**
 * Remove duplicate player selections from form data
 */
export function removeDuplicatePlayer<T extends Record<string, any>>(
  formData: T,
  currentField: keyof T,
  newPlayer: PlayerOption | string | number | null
): T {
  const updated = { ...formData, [currentField]: newPlayer };
  const newPlayerValue = getPlayerValue(newPlayer);
  
  Object.keys(updated).forEach(key => {
    if (key !== currentField && key.includes('Player')) {
      const existingValue = getPlayerValue(updated[key as keyof T]);
      if (existingValue === newPlayerValue) {
        updated[key as keyof T] = null as any;
      }
    }
  });
  
  return updated;
}

/**
 * Convert player name to player option object
 */
export function nameToPlayerOption(name: string | null | undefined, nameToIdMap: Map<string, number>): PlayerOption | '' {
  if (!name) return '';
  const playerId = nameToIdMap.get(name);
  if (playerId) {
    return { value: playerId, label: name };
  }
  return { value: name, label: name };
}

/**
 * Default player sorting with tie-breakers: Points → Avg Pt Diff → Win Rate → ELO
 */
export const sortPlayersDefault = (a: Player, b: Player): number => {
  const aPoints = a.Points ?? 0;
  const bPoints = b.Points ?? 0;
  if (aPoints !== bPoints) return bPoints - aPoints;
  
  const aAvgDiff = a.avg_pt_diff ?? 0;
  const bAvgDiff = b.avg_pt_diff ?? 0;
  if (aAvgDiff !== bAvgDiff) return bAvgDiff - aAvgDiff;
  
  const aWinRate = a.win_rate ?? 0;
  const bWinRate = b.win_rate ?? 0;
  if (aWinRate !== bWinRate) return bWinRate - aWinRate;
  
  const aELO = a.ELO ?? 0;
  const bELO = b.ELO ?? 0;
  return bELO - aELO;
};

/**
 * Get the first place player from rankings array
 */
export const getFirstPlacePlayer = (rankings: Player[]): Player | null => {
  if (!rankings || rankings.length === 0) return null;
  return [...rankings].sort(sortPlayersDefault)[0];
};

/**
 * Check if a player profile is incomplete
 */
export function isProfileIncomplete(player: Player | null | undefined): boolean {
  if (!player) {
    return true;
  }
  
  return !player.gender || !player.level || !player.city;
}



