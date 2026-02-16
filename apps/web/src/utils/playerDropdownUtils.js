/**
 * Utility functions for PlayerDropdown component
 */

/**
 * Check if an item is an object with value/label
 */
export function isPlayerOption(item) {
  return item && typeof item === 'object' && 'value' in item && 'label' in item;
}

/**
 * Get display value from either string or object
 */
export function getDisplayValue(item) {
  if (!item) return '';
  return isPlayerOption(item) ? item.label : item;
}

/**
 * Get the value (ID) from either string or object
 */
export function getValue(item) {
  if (!item) return '';
  return isPlayerOption(item) ? item.value : item;
}

/**
 * Normalize player names to array of objects with value/label
 */
export function normalizePlayerNames(allPlayerNames) {
  if (!Array.isArray(allPlayerNames) || allPlayerNames.length === 0) {
    return [];
  }
  
  return allPlayerNames.map(player => {
    if (isPlayerOption(player)) {
      return player;
    }
    return { value: player, label: player };
  });
}

/**
 * Check if a player is excluded
 */
export function isPlayerExcluded(player, excludePlayers) {
  return excludePlayers.some(excluded => {
    if (isPlayerOption(excluded)) {
      return excluded.value === player.value;
    }
    return excluded === player.value || excluded === player.label;
  });
}

/**
 * Check if any filtered player label exactly matches the search term (case-insensitive).
 * @param {Array} filteredPlayers - Normalized player options
 * @param {string} searchTerm - Trimmed search input
 * @returns {boolean} True if an exact match exists
 */
export function hasExactMatch(filteredPlayers, searchTerm) {
  if (!searchTerm) return false;
  const lower = searchTerm.toLowerCase();
  return filteredPlayers.some(p => p.label.toLowerCase() === lower);
}

/**
 * Filter players based on search term and exclusions
 */
export function filterPlayers(normalizedPlayers, excludePlayers, searchTerm) {
  return normalizedPlayers.filter(player => {
    // Check if excluded
    if (isPlayerExcluded(player, excludePlayers)) {
      return false;
    }
    
    // Filter by search term
    const label = player.label.toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return label.includes(searchLower);
  });
}
