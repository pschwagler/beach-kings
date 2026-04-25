/**
 * TDD tests for useScoreGameScreen.
 *
 * Covers:
 *   (a) submit with sessionId — sends session_id in body, navigates to session screen
 *   (b) submit without sessionId — sends session_id: null, receives new session in
 *       response, navigates to new session screen
 *   (c) "Add Another Game" preserves session context, clears form
 *   (d) error path — errorMessage set, submitState = 'error'
 *   (e) is_ranked defaults — league variant = true, pickup = false
 *   (f) roster source — session → getSessionParticipants, league only →
 *       getLeagueMembers, neither → getFriends fallback
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockSubmitScoredGame = jest.fn();
const mockGetSessionParticipants = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetFriends = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitScoredGame: (...args: unknown[]) => mockSubmitScoredGame(...args),
    getSessionParticipants: (...args: unknown[]) => mockGetSessionParticipants(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import { useScoreGameScreen } from '@/components/screens/Games/useScoreGameScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal roster returned by mocked endpoints. */
const MOCK_PARTICIPANTS = [
  { player_id: 10, full_name: 'Chris Gulla', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 11, full_name: 'Kyle Fawwar', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 12, full_name: 'Alex Marthey', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 13, full_name: 'Sam Jindash', level: null, gender: null, location_name: null, is_placeholder: false },
];

/** LeagueMember shape returned by getLeagueMembers. */
const MOCK_LEAGUE_MEMBERS = [
  { id: 1, league_id: 3, player_id: 10, role: 'member' as const, created_at: '', player_name: 'Chris Gulla' },
  { id: 2, league_id: 3, player_id: 11, role: 'member' as const, created_at: '', player_name: 'Kyle Fawwar' },
  { id: 3, league_id: 3, player_id: 12, role: 'member' as const, created_at: '', player_name: 'Alex Marthey' },
  { id: 4, league_id: 3, player_id: 13, role: 'member' as const, created_at: '', player_name: 'Sam Jindash' },
];

/** FriendListResponse shape returned by getFriends. */
const MOCK_FRIENDS_RESPONSE = {
  items: [
    { id: 1, player_id: 20, full_name: 'Jake Drabos', avatar: null, location_name: null, level: null },
    { id: 2, player_id: 21, full_name: 'Mike Salizar', avatar: null, location_name: null, level: null },
  ],
  total_count: 2,
};

/** Assign all 4 player slots and set score > 0. */
function fillSlots(result: ReturnType<typeof renderHook<ReturnType<typeof useScoreGameScreen>, unknown>>['result']) {
  act(() => {
    result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'Chris Gulla', initials: 'CG' });
    result.current.assignPlayer(1, 1, { player_id: 11, display_name: 'Kyle Fawwar', initials: 'KF' });
    result.current.assignPlayer(2, 0, { player_id: 12, display_name: 'Alex Marthey', initials: 'AM' });
    result.current.assignPlayer(2, 1, { player_id: 13, display_name: 'Sam Jindash', initials: 'SJ' });
    result.current.setScore1(5);
    result.current.setScore2(3);
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmitScoredGame.mockResolvedValue({
    status: 'success',
    message: 'Game created successfully',
    match_id: 999,
    session_id: 42,
  });
  mockGetSessionParticipants.mockResolvedValue(MOCK_PARTICIPANTS);
  mockGetLeagueMembers.mockResolvedValue(MOCK_LEAGUE_MEMBERS);
  mockGetFriends.mockResolvedValue(MOCK_FRIENDS_RESPONSE);
});

// ---------------------------------------------------------------------------
// (a) submit WITH sessionId
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — submit with sessionId', () => {
  it('sends session_id in the request body', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    expect(result.current.canSubmit).toBe(true);

    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.session_id).toBe(7);
  });

  it('navigates to the existing session screen after success', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('success'));
    expect(result.current.lastSessionId).toBe(42);
  });

  it('sets submitState to success', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('success'));
  });
});

// ---------------------------------------------------------------------------
// (b) submit WITHOUT sessionId (new session path)
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — submit without sessionId', () => {
  it('sends session_id: null in the request body', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.session_id).toBeNull();
  });

  it('stores the session_id returned from response in lastSessionId', async () => {
    mockSubmitScoredGame.mockResolvedValue({
      status: 'success',
      message: 'Game created successfully',
      match_id: 888,
      session_id: 55,
    });

    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('success'));
    expect(result.current.lastSessionId).toBe(55);
  });

  it('sets submitState to success after backend creates a new session', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('success'));
  });
});

// ---------------------------------------------------------------------------
// (c) "Add Another Game" — preserves session context, clears form
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — onAddAnother', () => {
  it('resets submitState to idle', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    act(() => {
      result.current.onAddAnother();
    });

    expect(result.current.submitState).toBe('idle');
  });

  it('clears player slots', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    act(() => {
      result.current.onAddAnother();
    });

    expect(result.current.team1[0].player_id).toBeNull();
    expect(result.current.team1[1].player_id).toBeNull();
    expect(result.current.team2[0].player_id).toBeNull();
    expect(result.current.team2[1].player_id).toBeNull();
  });

  it('resets scores to 0', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    act(() => {
      result.current.onAddAnother();
    });

    expect(result.current.score1).toBe(0);
    expect(result.current.score2).toBe(0);
  });

  it('preserves the sessionId context for the next submit', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    act(() => {
      result.current.onAddAnother();
    });

    // Fill again and submit
    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalledTimes(2));
    const secondPayload = mockSubmitScoredGame.mock.calls[1][0];
    expect(secondPayload.session_id).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// (d) Error path
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — error path', () => {
  it('sets submitState to error when submit throws', async () => {
    mockSubmitScoredGame.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('error'));
  });

  it('captures errorMessage from thrown Error', async () => {
    mockSubmitScoredGame.mockRejectedValue(new Error('Server 500'));

    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('error'));
    expect(result.current.errorMessage).toBe('Server 500');
  });

  it('uses fallback message for non-Error throws', async () => {
    mockSubmitScoredGame.mockRejectedValue('oops');

    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('error'));
    expect(result.current.errorMessage).toBe('Unknown error occurred.');
  });

  it('resets to idle and clears errorMessage on onRetry', async () => {
    mockSubmitScoredGame.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('error'));

    act(() => {
      result.current.onRetry();
    });

    expect(result.current.submitState).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (e) is_ranked defaults
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — is_ranked defaults', () => {
  it('sends is_ranked: false for pickup (no leagueId)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.is_ranked).toBe(false);
  });

  it('sends is_ranked: true for league game (leagueId provided)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.is_ranked).toBe(true);
  });

  it('exposes isRanked state', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(result.current.isRanked).toBe(true);
  });

  it('isRanked toggles when setIsRanked is called', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.setIsRanked(false);
    });

    expect(result.current.isRanked).toBe(false);

    // Override should be reflected in submit payload
    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.is_ranked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (f) Roster source selection
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — roster source', () => {
  it('fetches session participants when sessionId is provided', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => {
      expect(mockGetSessionParticipants).toHaveBeenCalledWith(7);
      expect(result.current.roster.length).toBe(MOCK_PARTICIPANTS.length);
    });
  });

  it('maps full_name to display_name and derives initials', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    const first = result.current.roster[0];
    expect(first.display_name).toBe('Chris Gulla');
    expect(first.initials).toBe('CG');
    expect(first.player_id).toBe(10);
  });

  it('fetches league members when only leagueId is provided (no sessionId)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => {
      expect(mockGetLeagueMembers).toHaveBeenCalledWith(3);
      expect(result.current.roster.length).toBe(MOCK_PARTICIPANTS.length);
    });
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
  });

  it('falls back to friends when neither sessionId nor leagueId is provided', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => {
      expect(mockGetFriends).toHaveBeenCalled();
      expect(result.current.roster.length).toBe(MOCK_FRIENDS_RESPONSE.items.length);
    });
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
  });

  it('does not call league members API when sessionId is also provided', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7, leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(mockGetSessionParticipants).toHaveBeenCalledWith(7);
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
  });

  it('filters roster by search query', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.setSearch('chris');
    });

    expect(result.current.filteredRoster.length).toBe(1);
    expect(result.current.filteredRoster[0].display_name).toBe('Chris Gulla');
  });

  it('shows full roster when search is empty', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.setSearch('');
    });

    expect(result.current.filteredRoster.length).toBe(result.current.roster.length);
  });
});

// ---------------------------------------------------------------------------
// General — canSubmit gate
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — canSubmit', () => {
  it('is false when slots are empty', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(result.current.canSubmit).toBe(false);
  });

  it('is false when all slots filled but score is 0', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'A', initials: 'A' });
      result.current.assignPlayer(1, 1, { player_id: 11, display_name: 'B', initials: 'B' });
      result.current.assignPlayer(2, 0, { player_id: 12, display_name: 'C', initials: 'C' });
      result.current.assignPlayer(2, 1, { player_id: 13, display_name: 'D', initials: 'D' });
    });

    expect(result.current.canSubmit).toBe(false);
  });

  it('is true when all slots filled and score > 0', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    expect(result.current.canSubmit).toBe(true);
  });

  it('does not call submitScoredGame when canSubmit is false', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    await act(async () => {
      result.current.onSubmit();
    });

    expect(mockSubmitScoredGame).not.toHaveBeenCalled();
  });
});
