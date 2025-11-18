/**
 * Utility functions for league-related operations
 */

export const LEVEL_OPTIONS = [
  { value: '', label: 'Select skill level' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'Open', label: 'Open' }
];

export const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' }
];

/**
 * Get display name for a player
 */
export function getPlayerDisplayName(player, isCurrentUser = false) {
  const name = player?.full_name || player?.player_name || player?.nickname || player?.name || `Player ${player?.id || player?.player_id}`;
  return isCurrentUser ? `${name} (you)` : name;
}

/**
 * Check if a player matches search term
 */
export function matchesSearchTerm(player, searchTerm) {
  if (!searchTerm.trim()) return false;
  const searchLower = searchTerm.toLowerCase();
  const fullName = (player.full_name || '').toLowerCase();
  const nickname = (player.nickname || '').toLowerCase();
  const name = (player.name || '').toLowerCase();
  return fullName.includes(searchLower) || nickname.includes(searchLower) || name.includes(searchLower);
}

/**
 * Format date range for display
 */
export function formatDateRange(startDate, endDate) {
  return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
}

