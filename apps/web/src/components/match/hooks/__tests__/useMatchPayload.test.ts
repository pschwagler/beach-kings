import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useMatchPayload } from '../useMatchPayload';

const makeFormData = (overrides = {}) => ({
  team1Player1: 'Alice',
  team1Player2: 'Bob',
  team2Player1: 'Carol',
  team2Player2: 'Dave',
  ...overrides,
});

// Maps player name → ID for simple fixture
const PLAYER_IDS = { Alice: 1, Bob: 2, Carol: 3, Dave: 4 };
const getPlayerId = (name) => PLAYER_IDS[name] ?? null;

const makeDefaultProps = (overrides = {}) => ({
  matchType: 'casual',
  selectedLeagueId: null,
  selectedSeasonId: null,
  allSeasons: [],
  sessionId: null,
  isRanked: true,
  getPlayerId,
  formData: makeFormData(),
  ...overrides,
});

const validScoresValidation = { isValid: true, score1: 21, score2: 15 };

describe('useMatchPayload', () => {
  describe('buildMatchPayload — base structure', () => {
    it('maps player names to IDs correctly', () => {
      const { result } = renderHook(() => useMatchPayload(makeDefaultProps()));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.team1_player1_id).toBe(1);
      expect(payload.team1_player2_id).toBe(2);
      expect(payload.team2_player1_id).toBe(3);
      expect(payload.team2_player2_id).toBe(4);
    });

    it('includes scores from scoresValidation', () => {
      const { result } = renderHook(() => useMatchPayload(makeDefaultProps()));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.team1_score).toBe(21);
      expect(payload.team2_score).toBe(15);
    });

    it('includes is_ranked from props', () => {
      const { result } = renderHook(() => useMatchPayload(makeDefaultProps({ isRanked: false })));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.is_ranked).toBe(false);
    });
  });

  describe('buildMatchPayload — league match fields', () => {
    it('includes league_id and season_id for league match when both are selected', () => {
      const props = makeDefaultProps({
        matchType: 'league',
        selectedLeagueId: 10,
        selectedSeasonId: 3,
        allSeasons: [{ id: 3 }],
      });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.league_id).toBe(10);
      expect(payload.season_id).toBe(3);
    });

    it('falls back to single season id when selectedSeasonId is null', () => {
      const props = makeDefaultProps({
        matchType: 'league',
        selectedLeagueId: 10,
        selectedSeasonId: null,
        allSeasons: [{ id: 99 }],
      });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.season_id).toBe(99);
    });

    it('omits season_id when no season selected and multiple seasons exist', () => {
      const props = makeDefaultProps({
        matchType: 'league',
        selectedLeagueId: 10,
        selectedSeasonId: null,
        allSeasons: [{ id: 1 }, { id: 2 }],
      });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.season_id).toBeUndefined();
    });

    it('does not include league_id for casual match', () => {
      const props = makeDefaultProps({
        matchType: 'casual',
        selectedLeagueId: 10,
        selectedSeasonId: 3,
      });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.league_id).toBeUndefined();
      expect(payload.season_id).toBeUndefined();
    });

    it('does not include league_id when selectedLeagueId is null even for league matchType', () => {
      const props = makeDefaultProps({
        matchType: 'league',
        selectedLeagueId: null,
      });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.league_id).toBeUndefined();
    });
  });

  describe('buildMatchPayload — session_id', () => {
    it('includes session_id when sessionId is provided', () => {
      const props = makeDefaultProps({ sessionId: 7 });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.session_id).toBe(7);
    });

    it('omits session_id when sessionId is null', () => {
      const props = makeDefaultProps({ sessionId: null });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.session_id).toBeUndefined();
    });
  });

  describe('buildMatchPayload — date', () => {
    it('includes date when provided', () => {
      const props = makeDefaultProps({ date: '2026-03-31' });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.date).toBe('2026-03-31');
    });

    it('omits date when null', () => {
      const props = makeDefaultProps({ date: null });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.date).toBeUndefined();
    });
  });

  describe('buildMatchPayload — court_id', () => {
    it('includes court_id when provided', () => {
      const props = makeDefaultProps({ courtId: 42 });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.court_id).toBe(42);
    });

    it('omits court_id when null', () => {
      const props = makeDefaultProps({ courtId: null });
      const { result } = renderHook(() => useMatchPayload(props));

      let payload;
      act(() => {
        payload = result.current.buildMatchPayload(validScoresValidation);
      });

      expect(payload.court_id).toBeUndefined();
    });
  });

  describe('hook return value', () => {
    it('returns buildMatchPayload function', () => {
      const { result } = renderHook(() => useMatchPayload(makeDefaultProps()));

      expect(typeof result.current.buildMatchPayload).toBe('function');
    });
  });
});
