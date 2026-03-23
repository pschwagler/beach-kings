import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useMatchValidation } from '../useMatchValidation';

vi.mock('../../../../utils/matchValidation', () => ({
  validateFormFields: vi.fn(),
  validateScores: vi.fn(),
}));

import { validateFormFields, validateScores } from '../../../../utils/matchValidation';

const makeValidFormData = () => ({
  team1Player1: 'Alice',
  team1Player2: 'Bob',
  team2Player1: 'Carol',
  team2Player2: 'Dave',
  team1Score: '21',
  team2Score: '15',
});

const makeDefaultProps = (overrides = {}) => ({
  formData: makeValidFormData(),
  editMatch: false,
  matchType: 'casual',
  selectedLeagueId: null,
  selectedSeasonId: null,
  allSeasons: [],
  setSelectedSeasonId: vi.fn(),
  setActiveSeason: vi.fn(),
  setFormError: vi.fn(),
  ...overrides,
});

describe('useMatchValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateFormFields.mockReturnValue({ isValid: true, errorMessage: null });
    validateScores.mockReturnValue({ isValid: true, errorMessage: null, score1: 21, score2: 15 });
  });

  describe('validateForm — field validation failures', () => {
    it('returns isValid: false and calls setFormError when validateFormFields fails', () => {
      validateFormFields.mockReturnValue({
        isValid: false,
        errorMessage: 'Please fill in all player fields',
      });

      const setFormError = vi.fn();
      const props = makeDefaultProps({ setFormError });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: false });
      expect(setFormError).toHaveBeenCalledWith('Please fill in all player fields');
    });

    it('returns isValid: false and calls setFormError when validateScores fails', () => {
      validateFormFields.mockReturnValue({ isValid: true, errorMessage: null });
      validateScores.mockReturnValue({
        isValid: false,
        errorMessage: 'Scores cannot be tied. There must be a winner.',
      });

      const setFormError = vi.fn();
      const props = makeDefaultProps({ setFormError });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: false });
      expect(setFormError).toHaveBeenCalledWith('Scores cannot be tied. There must be a winner.');
    });
  });

  describe('validateForm — league and season validation', () => {
    it('returns isValid: false with "Please select a league" when league match has no league', () => {
      const setFormError = vi.fn();
      const props = makeDefaultProps({
        matchType: 'league',
        editMatch: false,
        selectedLeagueId: null,
        setFormError,
      });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: false });
      expect(setFormError).toHaveBeenCalledWith('Please select a league');
    });

    it('returns isValid: false with openSeasonDropdown: true when multiple seasons and none selected', () => {
      const setFormError = vi.fn();
      const props = makeDefaultProps({
        matchType: 'league',
        editMatch: false,
        selectedLeagueId: 10,
        selectedSeasonId: null,
        allSeasons: [{ id: 1 }, { id: 2 }],
        setFormError,
      });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: false, openSeasonDropdown: true });
      expect(setFormError).toHaveBeenCalledWith('Please select a season');
    });

    it('auto-selects single season when only one season exists and none selected', () => {
      const season = { id: 42, name: 'Summer 2024' };
      const setSelectedSeasonId = vi.fn();
      const setActiveSeason = vi.fn();
      const props = makeDefaultProps({
        matchType: 'league',
        editMatch: false,
        selectedLeagueId: 10,
        selectedSeasonId: null,
        allSeasons: [season],
        setSelectedSeasonId,
        setActiveSeason,
      });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(setSelectedSeasonId).toHaveBeenCalledWith(42);
      expect(setActiveSeason).toHaveBeenCalledWith(season);
      // Should still proceed as valid after auto-selection
      expect(returnVal.isValid).toBe(true);
    });

    it('skips league/season validation when editMatch is true', () => {
      const setFormError = vi.fn();
      const props = makeDefaultProps({
        matchType: 'league',
        editMatch: true,
        selectedLeagueId: null,
        setFormError,
      });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal.isValid).toBe(true);
      expect(setFormError).not.toHaveBeenCalled();
    });
  });

  describe('validateForm — success path', () => {
    it('returns isValid: true with scoresValidation for a fully valid casual match', () => {
      const scoresValidation = { isValid: true, errorMessage: null, score1: 21, score2: 15 };
      validateScores.mockReturnValue(scoresValidation);

      const props = makeDefaultProps({ matchType: 'casual' });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: true, scoresValidation });
    });

    it('returns isValid: true for league match with league and season selected', () => {
      const scoresValidation = { isValid: true, errorMessage: null, score1: 21, score2: 15 };
      validateScores.mockReturnValue(scoresValidation);

      const props = makeDefaultProps({
        matchType: 'league',
        selectedLeagueId: 10,
        selectedSeasonId: 3,
        allSeasons: [{ id: 3 }, { id: 4 }],
      });
      const { result } = renderHook(() => useMatchValidation(props));

      let returnVal;
      act(() => {
        returnVal = result.current.validateForm();
      });

      expect(returnVal).toEqual({ isValid: true, scoresValidation });
    });
  });

  describe('hook return value', () => {
    it('returns validateForm function', () => {
      const props = makeDefaultProps();
      const { result } = renderHook(() => useMatchValidation(props));

      expect(typeof result.current.validateForm).toBe('function');
    });
  });
});
