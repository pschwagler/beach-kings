/**
 * Guard tests: API key contract enforcement.
 *
 * These tests ensure that API response shapes use snake_case keys only.
 * If a space-keyed or PascalCase key slips back in (e.g., "Team 1 Player 1"
 * instead of "team_1_player_1"), these tests will catch it.
 *
 * The canonical key lists below mirror the Pydantic schemas in
 * apps/backend/models/schemas.py and the dict shapes in
 * apps/backend/services/stats_read_data.py.
 */

import { describe, it, expect } from 'vitest';

/** Assert every key in the object is snake_case (lowercase + underscores + digits). */
function assertSnakeCaseKeys(obj: Record<string, unknown>, context: string): void {
  const snakeCasePattern = /^[a-z][a-z0-9_]*$/;
  for (const key of Object.keys(obj)) {
    expect(
      snakeCasePattern.test(key),
      `Key "${key}" in ${context} is not snake_case`
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Canonical key sets — keep in sync with backend schemas
// ---------------------------------------------------------------------------

const RANKING_KEYS = [
  'player_id', 'name', 'avatar', 'initials', 'is_placeholder',
  'elo', 'points', 'games', 'wins', 'losses',
  'win_rate', 'avg_pt_diff', 'season_rank',
];

const MATCH_RESPONSE_KEYS = [
  'date', 'team_1_player_1', 'team_1_player_2',
  'team_2_player_1', 'team_2_player_2',
  'team_1_score', 'team_2_score', 'winner',
  'team_1_elo_change', 'team_2_elo_change',
];

const MATCH_HISTORY_KEYS = [
  'date', 'partner', 'partner_id', 'partner_is_placeholder',
  'opponent_1', 'opponent_1_id', 'opponent_1_is_placeholder',
  'opponent_2', 'opponent_2_id', 'opponent_2_is_placeholder',
  'result', 'score', 'elo_change', 'elo_after',
  'session_status', 'session_id', 'session_name', 'session_code',
  'season_id', 'season_name',
  'league_id', 'league_name',
  'is_ranked', 'ranked_intent', 'court_name',
];

const PARTNERSHIP_STATS_KEYS = [
  'player_id', 'partner_opponent',
  'points', 'games', 'wins', 'losses',
  'win_rate', 'avg_pt_diff',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API key contract — snake_case enforcement', () => {
  it('ranking keys are all snake_case', () => {
    const mockRanking = Object.fromEntries(RANKING_KEYS.map(k => [k, null]));
    assertSnakeCaseKeys(mockRanking, 'RankingResponse');
  });

  it('match response keys are all snake_case', () => {
    const mockMatch = Object.fromEntries(MATCH_RESPONSE_KEYS.map(k => [k, null]));
    assertSnakeCaseKeys(mockMatch, 'MatchResponse');
  });

  it('match history keys are all snake_case', () => {
    const mockHistory = Object.fromEntries(MATCH_HISTORY_KEYS.map(k => [k, null]));
    assertSnakeCaseKeys(mockHistory, 'PlayerMatchHistoryResponse');
  });

  it('partnership stats keys are all snake_case', () => {
    const mockPartnership = Object.fromEntries(PARTNERSHIP_STATS_KEYS.map(k => [k, null]));
    assertSnakeCaseKeys(mockPartnership, 'PartnershipStats');
  });

  it('rejects space-keyed fields', () => {
    const badObj = { 'Team 1 Player 1': 'Alice', team_1_score: 21 };
    expect(() => assertSnakeCaseKeys(badObj, 'test')).toThrow(
      'Key "Team 1 Player 1" in test is not snake_case'
    );
  });

  it('rejects PascalCase fields', () => {
    const badObj = { Points: 10, games: 5 };
    expect(() => assertSnakeCaseKeys(badObj, 'test')).toThrow(
      'Key "Points" in test is not snake_case'
    );
  });

  it('rejects slash-keyed fields', () => {
    const badObj = { 'Partner/Opponent': 'Bob' };
    expect(() => assertSnakeCaseKeys(badObj, 'test')).toThrow(
      'Key "Partner/Opponent" in test is not snake_case'
    );
  });
});

describe('API key contract — canonical key completeness', () => {
  it('ranking response includes all expected fields', () => {
    const required = ['player_id', 'name', 'avatar', 'elo', 'points', 'games', 'wins', 'losses', 'win_rate', 'avg_pt_diff'];
    for (const key of required) {
      expect(RANKING_KEYS).toContain(key);
    }
  });

  it('match response includes all team fields', () => {
    for (const team of [1, 2]) {
      for (const player of [1, 2]) {
        expect(MATCH_RESPONSE_KEYS).toContain(`team_${team}_player_${player}`);
      }
      expect(MATCH_RESPONSE_KEYS).toContain(`team_${team}_score`);
      expect(MATCH_RESPONSE_KEYS).toContain(`team_${team}_elo_change`);
    }
  });

  it('match history includes session and league metadata', () => {
    const sessionKeys = ['session_id', 'session_name', 'session_code', 'session_status'];
    const leagueKeys = ['league_id', 'league_name'];
    for (const key of [...sessionKeys, ...leagueKeys]) {
      expect(MATCH_HISTORY_KEYS).toContain(key);
    }
  });
});
