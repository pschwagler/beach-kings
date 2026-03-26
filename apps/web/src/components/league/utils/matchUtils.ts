/**
 * Match transformation utilities
 */

/** A raw match object as returned by the API (snake_case). */
export interface RawMatch {
  id: number | string;
  date?: string | null;
  session_id?: number | null;
  session_name?: string | null;
  session_status?: string | null;
  session_season_id?: number | null;
  session_created_at?: string | null;
  session_updated_at?: string | null;
  session_created_by_name?: string | null;
  session_updated_by_name?: string | null;
  team1_player1_id?: number | null;
  team1_player2_id?: number | null;
  team2_player1_id?: number | null;
  team2_player2_id?: number | null;
  team1_player1_name?: string | null;
  team1_player2_name?: string | null;
  team2_player1_name?: string | null;
  team2_player2_name?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
  winner?: number | null;
  is_ranked?: boolean | null;
  ranked_intent?: string | boolean | null;
  team1_elo_change?: number;
  team2_elo_change?: number;
  elo_changes?: Record<number, { elo_change?: number }>;
  [key: string]: unknown;
}

/** A display-format match object (snake_case). */
export interface DisplayMatch {
  id: number | string;
  Date?: string | null;
  session_id?: number | null;
  session_name?: string | null;
  session_status?: string | null;
  session_season_id?: number | null;
  session_created_at?: string | null;
  session_updated_at?: string | null;
  session_created_by?: string | null;
  session_updated_by?: string | null;
  team_1_player_1?: string;
  team_1_player_2?: string;
  team_2_player_1?: string;
  team_2_player_2?: string;
  team_1_player_1_id?: number | null;
  team_1_player_2_id?: number | null;
  team_2_player_1_id?: number | null;
  team_2_player_2_id?: number | null;
  team_1_score?: number | null;
  team_2_score?: number | null;
  Winner?: string;
  is_ranked?: boolean | null;
  ranked_intent?: string | boolean | null;
  team_1_player_1_is_placeholder?: boolean;
  team_1_player_2_is_placeholder?: boolean;
  team_2_player_1_is_placeholder?: boolean;
  team_2_player_2_is_placeholder?: boolean;
  'Team 1 ELO Change'?: number;
  'Team 2 ELO Change'?: number;
  [key: string]: unknown;
}

/** A league/session member with placeholder flag. */
interface MemberEntry {
  player_id: number;
  is_placeholder?: boolean | null;
  player_name?: string | null;
}

/**
 * Determine the winner based on team scores.
 * @param {number} team1Score
 * @param {number} team2Score
 * @returns {'Team 1'|'Team 2'|'Tie'}
 */
export function calculateWinner(team1Score: number | null | undefined, team2Score: number | null | undefined): string {
  if (team1Score == null || team2Score == null) return 'Tie';
  if (team1Score > team2Score) return 'Team 1';
  if (team1Score < team2Score) return 'Team 2';
  return 'Tie';
}

/** Display-format keys for the four player positions in a match. */
export const MATCH_POSITION_KEYS = {
  T1P1: 'team_1_player_1',
  T1P2: 'team_1_player_2',
  T2P1: 'team_2_player_1',
  T2P2: 'team_2_player_2',
  T1P1_ID: 'team_1_player_1_id',
  T1P2_ID: 'team_1_player_2_id',
  T2P1_ID: 'team_2_player_1_id',
  T2P2_ID: 'team_2_player_2_id',
};

/** Array of player name keys for iteration (excludes ID keys). */
const ALL_POSITION_KEYS = [
  MATCH_POSITION_KEYS.T1P1,
  MATCH_POSITION_KEYS.T1P2,
  MATCH_POSITION_KEYS.T2P1,
  MATCH_POSITION_KEYS.T2P2,
];

/**
 * Count unique players across matches in display format (team_1_player_1, etc.).
 * @param {Array<Object>} matches - Matches in display format (with team_1_player_1, etc.)
 * @returns {number} Number of unique player names
 */
export function getUniquePlayersCount(matches: DisplayMatch[]): number {
  const players = new Set<string>();
  (matches || []).forEach((match) => {
    for (const key of ALL_POSITION_KEYS) {
      const name = match[key];
      if (name && typeof name === 'string') players.add(name);
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
function applyPlaceholderFlags(displayMatch: DisplayMatch, rawMatch: RawMatch, placeholderPlayerIds: Set<number> | undefined): DisplayMatch {
  if (!placeholderPlayerIds || placeholderPlayerIds.size === 0) return displayMatch;
  return {
    ...displayMatch,
    team_1_player_1_is_placeholder: placeholderPlayerIds.has(rawMatch.team1_player1_id as number),
    team_1_player_2_is_placeholder: placeholderPlayerIds.has(rawMatch.team1_player2_id as number),
    team_2_player_1_is_placeholder: placeholderPlayerIds.has(rawMatch.team2_player1_id as number),
    team_2_player_2_is_placeholder: placeholderPlayerIds.has(rawMatch.team2_player2_id as number),
  };
}

/**
 * Build a Set of placeholder player IDs from a members/participants array.
 * @param {Array} members - Array of {player_id, is_placeholder} objects
 * @returns {Set<number>} Set of placeholder player IDs
 */
export function buildPlaceholderIdSet(members: MemberEntry[]): Set<number> {
  const ids = new Set<number>();
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
 * @returns {Object} Match in display format (team_1_player_1, etc.)
 */
export function sessionMatchToDisplayFormat(match: RawMatch, placeholderPlayerIds?: Set<number>): DisplayMatch {
  const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';
  const displayMatch: DisplayMatch = {
    id: match.id,
    Date: match.date,
    session_id: match.session_id,
    session_name: match.session_name || match.date,
    session_status: match.session_status || null,
    [MATCH_POSITION_KEYS.T1P1]: match.team1_player1_name || '',
    [MATCH_POSITION_KEYS.T1P2]: match.team1_player2_name || '',
    [MATCH_POSITION_KEYS.T2P1]: match.team2_player1_name || '',
    [MATCH_POSITION_KEYS.T2P2]: match.team2_player2_name || '',
    [MATCH_POSITION_KEYS.T1P1_ID]: match.team1_player1_id ?? null,
    [MATCH_POSITION_KEYS.T1P2_ID]: match.team1_player2_id ?? null,
    [MATCH_POSITION_KEYS.T2P1_ID]: match.team2_player1_id ?? null,
    [MATCH_POSITION_KEYS.T2P2_ID]: match.team2_player2_id ?? null,
    team_1_score: match.team1_score,
    team_2_score: match.team2_score,
    Winner: winner,
    is_ranked: match.is_ranked ?? true,
    ranked_intent: match.ranked_intent ?? true,
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
export function transformMatchData(matches: RawMatch[], placeholderPlayerIds?: Set<number>): DisplayMatch[] {
  return matches.map((match) => {
    const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';

    // Handle both context format (with elo_changes) and API format (with team elo changes)
    let team1EloChange = 0;
    let team2EloChange = 0;

    if (match.elo_changes) {
      // Context format: calculate team ELO changes from individual player changes
      const team1Players = [match.team1_player1_id, match.team1_player2_id].filter(Boolean) as number[];
      const team2Players = [match.team2_player1_id, match.team2_player2_id].filter(Boolean) as number[];

      team1Players.forEach(playerId => {
        if (match.elo_changes?.[playerId]) {
          team1EloChange += match.elo_changes[playerId].elo_change || 0;
        }
      });

      team2Players.forEach(playerId => {
        if (match.elo_changes?.[playerId]) {
          team2EloChange += match.elo_changes[playerId].elo_change || 0;
        }
      });
    } else {
      // API format: use team ELO changes directly
      team1EloChange = match.team1_elo_change || 0;
      team2EloChange = match.team2_elo_change || 0;
    }

    const displayMatch: DisplayMatch = {
      id: match.id,
      Date: match.date,
      session_id: match.session_id,
      session_name: match.session_name || match.date,
      session_status: match.session_status || null,
      session_season_id: match.session_season_id || null,
      session_created_at: match.session_created_at || null,
      session_updated_at: match.session_updated_at || null,
      session_created_by: match.session_created_by_name || null,
      session_updated_by: match.session_updated_by_name || null,
      [MATCH_POSITION_KEYS.T1P1]: match.team1_player1_name || '',
      [MATCH_POSITION_KEYS.T1P2]: match.team1_player2_name || '',
      [MATCH_POSITION_KEYS.T2P1]: match.team2_player1_name || '',
      [MATCH_POSITION_KEYS.T2P2]: match.team2_player2_name || '',
      [MATCH_POSITION_KEYS.T1P1_ID]: match.team1_player1_id ?? null,
      [MATCH_POSITION_KEYS.T1P2_ID]: match.team1_player2_id ?? null,
      [MATCH_POSITION_KEYS.T2P1_ID]: match.team2_player1_id ?? null,
      [MATCH_POSITION_KEYS.T2P2_ID]: match.team2_player2_id ?? null,
      team_1_score: match.team1_score,
      team_2_score: match.team2_score,
      Winner: winner,
      is_ranked: match.is_ranked ?? true,
      ranked_intent: match.ranked_intent ?? true,
      'Team 1 ELO Change': team1EloChange,
      'Team 2 ELO Change': team2EloChange,
    };
    return applyPlaceholderFlags(displayMatch, match, placeholderPlayerIds);
  });
}
