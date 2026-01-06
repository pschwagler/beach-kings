/**
 * Player data transformation utilities
 * Extracted from LeagueContext to separate concerns
 */

/**
 * Transform player season stats into the format expected by PlayerDetails component
 * @param {Object} seasonStats - Player season stats from context
 * @param {Object} partnershipOpponentStats - Partnership and opponent stats
 * @returns {Object} Formatted stats with overview and stats array
 */
export function formatPlayerSeasonStats(seasonStats, partnershipOpponentStats) {
  if (!seasonStats) return null;

  // Format stats array for PlayerStatsTable
  const statsArray = [];
  
  // Add overall row first
  statsArray.push({
    "Partner/Opponent": "OVERALL",
    "Points": seasonStats.points,
    "Games": seasonStats.games,
    "Wins": seasonStats.wins,
    "Losses": seasonStats.losses,
    "Win Rate": seasonStats.win_rate,
    "Avg Pt Diff": seasonStats.avg_point_diff
  });
  
  // Add empty row separator
  statsArray.push({ "Partner/Opponent": "" });
  
  // Add partnerships section
  if (partnershipOpponentStats?.partnerships && partnershipOpponentStats.partnerships.length > 0) {
    statsArray.push({ "Partner/Opponent": "WITH PARTNERS" });
    statsArray.push(...partnershipOpponentStats.partnerships);
    statsArray.push({ "Partner/Opponent": "" }); // Empty row
  }
  
  // Add opponents section
  if (partnershipOpponentStats?.opponents && partnershipOpponentStats.opponents.length > 0) {
    statsArray.push({ "Partner/Opponent": "VS OPPONENTS" });
    statsArray.push(...partnershipOpponentStats.opponents);
    statsArray.push({ "Partner/Opponent": "" }); // Empty row
  }
  
  // Format season stats for PlayerDetails component
  // Note: current_elo is now global (league/season agnostic), not season-specific
  return {
    overview: {
      ranking: seasonStats.rank,
      points: seasonStats.points,
      rating: seasonStats.current_elo, // Global ELO rating
      games: seasonStats.games,
      wins: seasonStats.wins,
      losses: seasonStats.losses,
      win_rate: seasonStats.win_rate,
      avg_point_diff: seasonStats.avg_point_diff
    },
    stats: statsArray
  };
}

/**
 * Transform match history for a specific player
 * Filters and formats matches where the player participated
 * @param {Array} matches - All matches from season data
 * @param {number} playerId - Player ID to filter matches for
 * @returns {Array} Formatted match history for the player
 */
export function formatPlayerMatchHistory(matches, playerId) {
  if (!matches || !playerId) return [];

  // Filter match history to only include matches where this player participated
  const playerMatches = matches.filter(match => {
    const playerIds = [
      match.team1_player1_id,
      match.team1_player2_id,
      match.team2_player1_id,
      match.team2_player2_id
    ].filter(Boolean);
    
    return playerIds.includes(playerId);
  });
  
  // Transform matches to MatchHistoryTable format
  return playerMatches.map(match => {
    // Determine which team the player was on
    const isTeam1 = match.team1_player1_id === playerId || match.team1_player2_id === playerId;
    
    let partner, opponent1, opponent2, playerScore, opponentScore, result;
    
    if (isTeam1) {
      partner = match.team1_player1_id === playerId 
        ? match.team1_player2_name 
        : match.team1_player1_name;
      opponent1 = match.team2_player1_name;
      opponent2 = match.team2_player2_name;
      playerScore = match.team1_score;
      opponentScore = match.team2_score;
      result = match.winner === 1 ? 'W' : match.winner === 2 ? 'L' : 'T';
    } else {
      partner = match.team2_player1_id === playerId 
        ? match.team2_player2_name 
        : match.team2_player1_name;
      opponent1 = match.team1_player1_name;
      opponent2 = match.team1_player2_name;
      playerScore = match.team2_score;
      opponentScore = match.team1_score;
      result = match.winner === 2 ? 'W' : match.winner === 1 ? 'L' : 'T';
    }
    
    // Get ELO change for this player
    const eloChange = match.elo_changes?.[playerId];
    const eloAfter = eloChange?.elo_after;
    const eloChangeValue = eloChange?.elo_change;
    
    return {
      Date: match.date,
      Partner: partner || '',
      'Opponent 1': opponent1 || '',
      'Opponent 2': opponent2 || '',
      Result: result,
      Score: `${playerScore}-${opponentScore}`,
      'ELO After': eloAfter,
      'ELO Change': eloChangeValue,
      'Session Status': match.session_status || null
    };
  });
}

/**
 * Transform player data from season data
 * Combines stats and match history formatting
 * @param {Object} seasonData - Season data (selectedSeasonData from context)
 * @param {number} playerId - Player ID
 * @returns {Object} Object with formatted stats and match history, or null if no data
 */
export function transformPlayerData(seasonData, playerId) {
  if (!seasonData || !playerId) {
    return {
      stats: null,
      matchHistory: []
    };
  }

  const seasonStats = seasonData.player_season_stats?.[playerId];
  const partnershipOpponentStats = seasonData.partnership_opponent_stats?.[playerId] || { partnerships: [], opponents: [] };
  const matches = seasonData.matches || [];

  const formattedStats = formatPlayerSeasonStats(seasonStats, partnershipOpponentStats);
  const matchHistory = formatPlayerMatchHistory(matches, playerId);

  return {
    stats: formattedStats,
    matchHistory: matchHistory
  };
}
