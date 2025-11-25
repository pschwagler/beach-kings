/**
 * Match transformation utilities
 */

/**
 * Transform match data from API format to MatchesTable format
 * Handles both context format (with elo_changes) and API format (with team elo changes)
 * @param {Array} matches - Array of match objects from API or context
 * @returns {Array} Transformed matches for display in MatchesTable
 */
export function transformMatchData(matches) {
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
    
    return {
      id: match.id,
      Date: match.date,
      'Session ID': match.session_id,
      'Session Name': match.session_name || match.date,
      'Session Status': match.session_status || null,
      'Session Created At': match.session_created_at || null,
      'Session Updated At': match.session_updated_at || null,
      'Session Created By': match.session_created_by_name || null,
      'Session Updated By': match.session_updated_by_name || null,
      'Team 1 Player 1': match.team1_player1_name || '',
      'Team 1 Player 2': match.team1_player2_name || '',
      'Team 2 Player 1': match.team2_player1_name || '',
      'Team 2 Player 2': match.team2_player2_name || '',
      'Team 1 Score': match.team1_score,
      'Team 2 Score': match.team2_score,
      Winner: winner,
      'Team 1 ELO Change': team1EloChange,
      'Team 2 ELO Change': team2EloChange,
    };
  });
}


