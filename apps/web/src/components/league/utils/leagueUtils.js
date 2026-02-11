/**
 * Utility functions for league-related operations
 */

import { LEVEL_OPTIONS } from '../../../utils/playerFilterOptions';

export { LEVEL_OPTIONS };

export const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' }
];

export const SEASON_RATING_DESCRIPTION = "All players start with 100 points and use a rating system (ELO) to compete for a number of points based on each teams average points. Rewards wins versus players with more points.";

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
