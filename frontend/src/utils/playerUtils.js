/**
 * Default player sorting with tie-breakers: Points → Avg Pt Diff → Win Rate → ELO
 */
export const sortPlayersDefault = (a, b) => {
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
export const getFirstPlacePlayer = (rankings) => {
  if (!rankings || rankings.length === 0) return null;
  return [...rankings].sort(sortPlayersDefault)[0];
};

