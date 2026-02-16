/**
 * Match transformation utilities
 */

/** Display-format keys for the four player positions in a match. */
export const MATCH_POSITION_KEYS = {
  T1P1: 'Team 1 Player 1',
  T1P2: 'Team 1 Player 2',
  T2P1: 'Team 2 Player 1',
  T2P2: 'Team 2 Player 2',
};

/** Array form for iteration convenience. */
const ALL_POSITION_KEYS = Object.values(MATCH_POSITION_KEYS);

/**
 * Count unique players across matches in display format (Team 1 Player 1, etc.).
 * @param {Array<Object>} matches - Matches in display format (with 'Team 1 Player 1', etc.)
 * @returns {number} Number of unique player names
 */
export function getUniquePlayersCount(matches) {
  const players = new Set();
  (matches || []).forEach((match) => {
    for (const key of ALL_POSITION_KEYS) {
      if (match[key]) players.add(match[key]);
    }
  });
  return players.size;
}

/**
 * Apply placeholder flags to a display-format match using a set of placeholder player IDs.
 * @param {Object} displayMatch - Match in display format
 * @param {Object} rawMatch - Raw match with player IDs
 * @param {Set<number>} [placeholderPlayerIds] - Set of player IDs that are placeholders
 * @returns {Object} displayMatch with isPlaceholder flags added
 */
function applyPlaceholderFlags(displayMatch, rawMatch, placeholderPlayerIds) {
  if (!placeholderPlayerIds || placeholderPlayerIds.size === 0) return displayMatch;
  return {
    ...displayMatch,
    [`${MATCH_POSITION_KEYS.T1P1} IsPlaceholder`]: placeholderPlayerIds.has(rawMatch.team1_player1_id),
    [`${MATCH_POSITION_KEYS.T1P2} IsPlaceholder`]: placeholderPlayerIds.has(rawMatch.team1_player2_id),
    [`${MATCH_POSITION_KEYS.T2P1} IsPlaceholder`]: placeholderPlayerIds.has(rawMatch.team2_player1_id),
    [`${MATCH_POSITION_KEYS.T2P2} IsPlaceholder`]: placeholderPlayerIds.has(rawMatch.team2_player2_id),
  };
}

/**
 * Build a Set of placeholder player IDs from a members/participants array.
 * @param {Array} members - Array of {player_id, is_placeholder} objects
 * @returns {Set<number>} Set of placeholder player IDs
 */
export function buildPlaceholderIdSet(members) {
  const ids = new Set();
  if (!members) return ids;
  for (const m of members) {
    if (m.is_placeholder) {
      ids.add(m.player_id);
    }
  }
  return ids;
}

/**
 * Transform a single match from session API (get_session_matches) to display format
 * used by MatchCard and SessionMatchesClipboardTable.
 * @param {Object} match - Match from getSessionMatches API (snake_case)
 * @param {Set<number>} [placeholderPlayerIds] - Optional set of placeholder player IDs
 * @returns {Object} Match in display format (Team 1 Player 1, etc.)
 */
export function sessionMatchToDisplayFormat(match, placeholderPlayerIds) {
  const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';
  const displayMatch = {
    id: match.id,
    Date: match.date,
    'Session ID': match.session_id,
    'Session Name': match.session_name || match.date,
    'Session Status': match.session_status || null,
    [MATCH_POSITION_KEYS.T1P1]: match.team1_player1_name || '',
    [MATCH_POSITION_KEYS.T1P2]: match.team1_player2_name || '',
    [MATCH_POSITION_KEYS.T2P1]: match.team2_player1_name || '',
    [MATCH_POSITION_KEYS.T2P2]: match.team2_player2_name || '',
    'Team 1 Score': match.team1_score,
    'Team 2 Score': match.team2_score,
    Winner: winner,
    'Is Ranked': match.is_ranked ?? true,
    'Team 1 ELO Change': 0,
    'Team 2 ELO Change': 0,
  };
  return applyPlaceholderFlags(displayMatch, match, placeholderPlayerIds);
}

/**
 * Transform match data from API format to MatchesTable format.
 * Handles both context format (with elo_changes) and API format (with team elo changes).
 * @param {Array} matches - Array of match objects from API or context
 * @param {Set<number>} [placeholderPlayerIds] - Optional set of placeholder player IDs
 * @returns {Array} Transformed matches for display in MatchesTable
 */
export function transformMatchData(matches, placeholderPlayerIds) {
  return matches.map(match => {
    const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';

    // Handle both context format (with elo_changes) and API format (with team elo changes)
    let team1EloChange = 0;
    let team2EloChange = 0;

    if (match.elo_changes) {
      // Context format: calculate team ELO changes from individual player changes
      const team1Players = [match.team1_player1_id, match.team1_player2_id].filter(Boolean);
      const team2Players = [match.team2_player1_id, match.team2_player2_id].filter(Boolean);

      team1Players.forEach(playerId => {
        if (match.elo_changes[playerId]) {
          team1EloChange += match.elo_changes[playerId].elo_change || 0;
        }
      });

      team2Players.forEach(playerId => {
        if (match.elo_changes[playerId]) {
          team2EloChange += match.elo_changes[playerId].elo_change || 0;
        }
      });
    } else {
      // API format: use team ELO changes directly
      team1EloChange = match.team1_elo_change || 0;
      team2EloChange = match.team2_elo_change || 0;
    }

    const displayMatch = {
      id: match.id,
      Date: match.date,
      'Session ID': match.session_id,
      'Session Name': match.session_name || match.date,
      'Session Status': match.session_status || null,
      'Session Season ID': match.session_season_id || null,
      'Session Created At': match.session_created_at || null,
      'Session Updated At': match.session_updated_at || null,
      'Session Created By': match.session_created_by_name || null,
      'Session Updated By': match.session_updated_by_name || null,
      [MATCH_POSITION_KEYS.T1P1]: match.team1_player1_name || '',
      [MATCH_POSITION_KEYS.T1P2]: match.team1_player2_name || '',
      [MATCH_POSITION_KEYS.T2P1]: match.team2_player1_name || '',
      [MATCH_POSITION_KEYS.T2P2]: match.team2_player2_name || '',
      'Team 1 Score': match.team1_score,
      'Team 2 Score': match.team2_score,
      Winner: winner,
      'Is Ranked': match.is_ranked ?? true,
      'Team 1 ELO Change': team1EloChange,
      'Team 2 ELO Change': team2EloChange,
    };
    return applyPlaceholderFlags(displayMatch, match, placeholderPlayerIds);
  });
}
