import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoAdvanceToNextField } from '../formNavigation';

describe('autoAdvanceToNextField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('field transitions', () => {
    it('advances from team1Player1 to team1Player2', () => {
      const mockInput = { focus: vi.fn() };
      const mockElement = { querySelector: vi.fn(() => mockInput), focus: vi.fn() };
      const refs = { team1Player2Ref: { current: mockElement } };

      autoAdvanceToNextField('team1Player1', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.querySelector).toHaveBeenCalledWith('.player-dropdown-input');
      expect(mockInput.focus).toHaveBeenCalledTimes(1);
    });

    it('advances from team1Player2 to team2Player1', () => {
      const mockInput = { focus: vi.fn() };
      const mockElement = { querySelector: vi.fn(() => mockInput), focus: vi.fn() };
      const refs = { team2Player1Ref: { current: mockElement } };

      autoAdvanceToNextField('team1Player2', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.querySelector).toHaveBeenCalledWith('.player-dropdown-input');
      expect(mockInput.focus).toHaveBeenCalledTimes(1);
    });

    it('advances from team2Player1 to team2Player2', () => {
      const mockInput = { focus: vi.fn() };
      const mockElement = { querySelector: vi.fn(() => mockInput), focus: vi.fn() };
      const refs = { team2Player2Ref: { current: mockElement } };

      autoAdvanceToNextField('team2Player1', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.querySelector).toHaveBeenCalledWith('.player-dropdown-input');
      expect(mockInput.focus).toHaveBeenCalledTimes(1);
    });

    it('advances from team2Player2 to team1Score', () => {
      const mockElement = { querySelector: vi.fn(), focus: vi.fn() };
      const refs = { team1ScoreRef: { current: mockElement } };

      autoAdvanceToNextField('team2Player2', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.focus).toHaveBeenCalledTimes(1);
      expect(mockElement.querySelector).not.toHaveBeenCalled();
    });
  });

  describe('player field behavior', () => {
    it('calls querySelector on player fields and focuses the input', () => {
      const mockInput = { focus: vi.fn() };
      const mockElement = { querySelector: vi.fn(() => mockInput), focus: vi.fn() };
      const refs = { team1Player2Ref: { current: mockElement } };

      autoAdvanceToNextField('team1Player1', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.querySelector).toHaveBeenCalledWith('.player-dropdown-input');
      expect(mockInput.focus).toHaveBeenCalledTimes(1);
      expect(mockElement.focus).not.toHaveBeenCalled();
    });
  });

  describe('score field behavior', () => {
    it('calls focus directly on the score ref without querySelector', () => {
      const mockElement = { querySelector: vi.fn(), focus: vi.fn() };
      const refs = { team1ScoreRef: { current: mockElement } };

      autoAdvanceToNextField('team2Player2', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.focus).toHaveBeenCalledTimes(1);
      expect(mockElement.querySelector).not.toHaveBeenCalled();
    });
  });

  describe('unknown field', () => {
    it('returns immediately for an unknown field and does not schedule a timeout', () => {
      const mockElement = { querySelector: vi.fn(), focus: vi.fn() };
      const refs = { team1ScoreRef: { current: mockElement } };

      autoAdvanceToNextField('team1Score', refs);
      vi.advanceTimersByTime(100);

      expect(mockElement.focus).not.toHaveBeenCalled();
      expect(mockElement.querySelector).not.toHaveBeenCalled();
    });
  });

  describe('missing or null refs', () => {
    it('does not throw when the ref key is absent from refs', () => {
      const refs = {};

      expect(() => {
        autoAdvanceToNextField('team1Player1', refs);
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });

    it('does not throw when ref.current is null', () => {
      const refs = { team1Player2Ref: { current: null } };

      expect(() => {
        autoAdvanceToNextField('team1Player1', refs);
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });

    it('does not throw when querySelector returns null for a player field', () => {
      const mockElement = { querySelector: vi.fn(() => null), focus: vi.fn() };
      const refs = { team1Player2Ref: { current: mockElement } };

      expect(() => {
        autoAdvanceToNextField('team1Player1', refs);
        vi.advanceTimersByTime(100);
      }).not.toThrow();

      expect(mockElement.querySelector).toHaveBeenCalledWith('.player-dropdown-input');
      expect(mockElement.focus).not.toHaveBeenCalled();
    });
  });
});
