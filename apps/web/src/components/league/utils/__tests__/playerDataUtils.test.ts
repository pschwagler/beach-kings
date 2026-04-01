/**
 * Tests for playerDataUtils — focused on formatPlayerMatchHistory
 * and the string/number ID coercion fix.
 */

import { describe, it, expect } from 'vitest';
import { formatPlayerMatchHistory } from '../playerDataUtils';

/** Minimal match object that covers all four player-ID positions. */
function buildMatch(overrides: Record<string, unknown> = {}) {
  return {
    date: '2024-01-15',
    team1_player1_id: 1,
    team1_player1_name: 'Alice',
    team1_player2_id: 2,
    team1_player2_name: 'Bob',
    team2_player1_id: 3,
    team2_player1_name: 'Carol',
    team2_player2_id: 4,
    team2_player2_name: 'Dave',
    team1_score: 21,
    team2_score: 15,
    winner: 1,
    session_status: 'submitted',
    elo_changes: {},
    ...overrides,
  };
}

describe('formatPlayerMatchHistory', () => {
  describe('numeric playerId (existing behaviour)', () => {
    it('returns matches where player is on team 1', () => {
      const matches = [buildMatch()];
      const result = formatPlayerMatchHistory(matches, 1);
      expect(result).toHaveLength(1);
      expect(result[0].result).toBe('W');
      expect(result[0].partner).toBe('Bob');
    });

    it('returns matches where player is on team 2', () => {
      const matches = [buildMatch()];
      const result = formatPlayerMatchHistory(matches, 3);
      expect(result).toHaveLength(1);
      expect(result[0].result).toBe('L');
      expect(result[0].partner).toBe('Dave');
    });

    it('returns empty array when player has no matches', () => {
      const matches = [buildMatch()];
      const result = formatPlayerMatchHistory(matches, 99);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when matches is empty', () => {
      expect(formatPlayerMatchHistory([], 1)).toHaveLength(0);
    });

    it('returns empty array when matches is null/undefined', () => {
       
      expect(formatPlayerMatchHistory(null as any, 1)).toHaveLength(0);
       
      expect(formatPlayerMatchHistory(undefined as any, 1)).toHaveLength(0);
    });
  });

  describe('string playerId (the bug: [123].includes("123") === false)', () => {
    it('returns matches when playerId is passed as a string "1"', () => {
      const matches = [buildMatch()];
       
      const result = formatPlayerMatchHistory(matches, '1' as any);
      expect(result).toHaveLength(1);
    });

    it('returns matches when playerId is passed as a string "3" (team 2 position)', () => {
      const matches = [buildMatch()];
       
      const result = formatPlayerMatchHistory(matches, '3' as any);
      expect(result).toHaveLength(1);
    });

    it('returns empty array when string playerId has no matches', () => {
      const matches = [buildMatch()];
       
      const result = formatPlayerMatchHistory(matches, '99' as any);
      expect(result).toHaveLength(0);
    });

    it('correctly identifies team membership when playerId is a string', () => {
      const matches = [buildMatch()];
       
      const result = formatPlayerMatchHistory(matches, '2' as any);
      expect(result).toHaveLength(1);
      // Player 2 is team1_player2 — partner should be Alice (team1_player1)
      expect(result[0].partner).toBe('Alice');
      expect(result[0].result).toBe('W');
    });
  });

  describe('ELO change extraction', () => {
    it('extracts elo_changes keyed by numeric playerId', () => {
      const matches = [
        buildMatch({ elo_changes: { 1: { elo_after: 1050, elo_change: 10 } } }),
      ];
      const result = formatPlayerMatchHistory(matches, 1);
      expect(result[0].elo_after).toBe(1050);
      expect(result[0].elo_change).toBe(10);
    });

    it('extracts elo_changes when playerId provided as string', () => {
      const matches = [
        buildMatch({ elo_changes: { 1: { elo_after: 1050, elo_change: 10 } } }),
      ];

      const result = formatPlayerMatchHistory(matches, '1' as any);
      expect(result[0].elo_after).toBe(1050);
      expect(result[0].elo_change).toBe(10);
    });
  });

  describe('score and result formatting', () => {
    it('formats score as "playerScore-opponentScore"', () => {
      const matches = [buildMatch({ team1_score: 21, team2_score: 15 })];
      const result = formatPlayerMatchHistory(matches, 1);
      expect(result[0].score).toBe('21-15');
    });

    it('returns "L" result for team2 player when winner is 2', () => {
      const matches = [buildMatch({ winner: 2 })];
      const result = formatPlayerMatchHistory(matches, 1);
      expect(result[0].result).toBe('L');
    });

    it('returns "T" result when winner is neither 1 nor 2', () => {
      const matches = [buildMatch({ winner: 0 })];
      const result = formatPlayerMatchHistory(matches, 1);
      expect(result[0].result).toBe('T');
    });
  });
});
