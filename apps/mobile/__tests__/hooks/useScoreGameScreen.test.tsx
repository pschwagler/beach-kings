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
 *   (f) roster source — session & league both → relevance-ranked
 *       searchPlayers('', {sessionId?, leagueId?}); session also fetches
 *       getSessionParticipants for gender/level inference; participants +
 *       friends only as a fallback when search is empty; neither →
 *       getFriends fallback
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
  useFocusEffect: jest.fn(),
}));

const mockSubmitScoredGame = jest.fn();
const mockGetSessionParticipants = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetFriends = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockUpdateMatch = jest.fn();
const mockDeleteMatch = jest.fn();
const mockGetSessionById = jest.fn();
const mockCreateSession = jest.fn();
const mockShareLink = jest.fn();
const mockSearchPlayers = jest.fn();
const mockCreatePlaceholder = jest.fn();
const mockGetLeague = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitScoredGame: (...args: unknown[]) => mockSubmitScoredGame(...args),
    getSessionParticipants: (...args: unknown[]) => mockGetSessionParticipants(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    updateMatch: (...args: unknown[]) => mockUpdateMatch(...args),
    deleteMatch: (...args: unknown[]) => mockDeleteMatch(...args),
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    searchPlayers: (...args: unknown[]) => mockSearchPlayers(...args),
    createPlaceholder: (...args: unknown[]) => mockCreatePlaceholder(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
  },
}));

jest.mock('@/utils/share', () => ({
  shareLink: (...args: unknown[]) => mockShareLink(...args),
}));

// Controllable AddNewPlayerContext bridge. The mock fns mutate module-level
// vars so a test can drive `request`/`result` and then re-render the hook to
// exercise openAddNewPlayer (sets request + navigates) and the
// result-consumption effect (seats the guest + pendingShareInvite).
interface MockBridgeRequest {
  team: 1 | 2;
  slot: 0 | 1;
  prefillName: string;
  inferredGender: string | null;
  inferredLevel: string | null;
  leagueId: number | null;
}
interface MockBridgeResult {
  team: 1 | 2;
  slot: 0 | 1;
  name: string;
  player_id: number;
  invite_url: string;
}
let mockBridgeRequest: MockBridgeRequest | null = null;
let mockBridgeResult: MockBridgeResult | null = null;
const mockBridgeSetRequest = jest.fn((r: MockBridgeRequest) => {
  mockBridgeRequest = r;
});
const mockBridgeClearRequest = jest.fn(() => {
  mockBridgeRequest = null;
});
const mockBridgeSetResult = jest.fn((r: MockBridgeResult) => {
  mockBridgeResult = r;
});
const mockBridgeConsumeResult = jest.fn(() => {
  const r = mockBridgeResult;
  mockBridgeResult = null;
  return r;
});
jest.mock('@/contexts/AddNewPlayerContext', () => ({
  __esModule: true,
  useAddNewPlayer: () => ({
    request: mockBridgeRequest,
    result: mockBridgeResult,
    setRequest: mockBridgeSetRequest,
    clearRequest: mockBridgeClearRequest,
    setResult: mockBridgeSetResult,
    consumeResult: mockBridgeConsumeResult,
  }),
  default: ({ children }: { children: React.ReactNode }) => children,
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

/**
 * Default ranked roster returned by `searchPlayers('', { leagueId })` —
 * the league-only path uses this single bounded list to populate the picker
 * on mount. No cursor: the client scrolls the returned set locally.
 */
const MOCK_LEAGUE_DEFAULT_ROSTER = {
  items: [
    { id: 10, first_name: 'Chris', last_name: 'Gulla', full_name: 'Chris Gulla', nickname: null, initials: 'CG', tags: ['friend'], score: 15, in_session: false },
    { id: 11, first_name: 'Kyle', last_name: 'Fawwar', full_name: 'Kyle Fawwar', nickname: null, initials: 'KF', tags: ['in_league'], score: 150, in_session: false },
    { id: 12, first_name: 'Alex', last_name: 'Marthey', full_name: 'Alex Marthey', nickname: null, initials: 'AM', tags: ['in_league'], score: 150, in_session: false },
    { id: 13, first_name: 'Sam', last_name: 'Jindash', full_name: 'Sam Jindash', nickname: null, initials: 'SJ', tags: ['in_league'], score: 150, in_session: false },
  ],
};

/** Assign all 4 player slots and set score > 0. */
function fillSlots(result: ReturnType<typeof renderHook<ReturnType<typeof useScoreGameScreen>, unknown>>['result']) {
  act(() => {
    result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'Chris Gulla', initials: 'CG', tags: [], isSession: false });
    result.current.assignPlayer(1, 1, { player_id: 11, display_name: 'Kyle Fawwar', initials: 'KF', tags: [], isSession: false });
    result.current.assignPlayer(2, 0, { player_id: 12, display_name: 'Alex Marthey', initials: 'AM', tags: [], isSession: false });
    result.current.assignPlayer(2, 1, { player_id: 13, display_name: 'Sam Jindash', initials: 'SJ', tags: [], isSession: false });
    result.current.setScore1(5);
    result.current.setScore2(3);
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockBridgeRequest = null;
  mockBridgeResult = null;
  mockSubmitScoredGame.mockResolvedValue({
    status: 'success',
    message: 'Game created successfully',
    match_id: 999,
    session_id: 42,
  });
  mockGetSessionParticipants.mockResolvedValue(MOCK_PARTICIPANTS);
  mockGetLeagueMembers.mockResolvedValue(MOCK_LEAGUE_MEMBERS);
  mockGetFriends.mockResolvedValue(MOCK_FRIENDS_RESPONSE);
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 77, name: 'Test User' });
  mockUpdateMatch.mockResolvedValue({});
  mockDeleteMatch.mockResolvedValue({});
  mockGetSessionById.mockResolvedValue({ id: 7, games: [] });
  mockCreateSession.mockResolvedValue({ id: 555, code: 'BKABC123' });
  mockShareLink.mockResolvedValue(undefined);
  // For initial roster load with leagueId-only, the hook calls searchPlayers
  // with q=''. Live search calls pass a non-empty q. Default both: empty q
  // returns the league default roster; everything else returns empty.
  mockSearchPlayers.mockImplementation((q: string) => {
    if (q === '') {
      return Promise.resolve(MOCK_LEAGUE_DEFAULT_ROSTER);
    }
    return Promise.resolve({ items: [] });
  });
  mockCreatePlaceholder.mockResolvedValue({
    player_id: 99,
    name: 'New Player',
    invite_token: 'tok',
    invite_url: 'https://x/invite/tok',
  });
  mockGetLeague.mockResolvedValue({
    id: 1,
    name: 'L',
    description: null,
    access_type: 'open' as const,
    gender: null,
    level: null,
    location_id: null,
    location_name: null,
    home_courts: [],
    member_count: 0,
    season_count: 0,
    current_season_id: null,
    current_season_name: null,
    is_active: true,
    user_role: null,
    user_rank: null,
    user_wins: null,
    user_losses: null,
    user_rating: null,
  });
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

  it('sends season_id in the submit payload for a league game', async () => {
    // Without season_id the backend falls back to "the season covering today"
    // and 400s when no season spans the current date. The screen already knows
    // the season from the route param, so it must forward it.
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 9 }),
    );
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlots(result);
    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockSubmitScoredGame).toHaveBeenCalled());
    const payload = mockSubmitScoredGame.mock.calls[0][0];
    expect(payload.season_id).toBe(9);
    expect(payload.league_id).toBe(3);
  });

  it('exposes isRanked=true for league context', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(result.current.isRanked).toBe(true);
  });

  it('exposes isRanked=false for pickup context (session.is_ranked absent)', async () => {
    // Default mock: { id: 7, games: [] } — no is_ranked → ?? false
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalledWith(7));
    expect(result.current.isRanked).toBe(false);
  });

  it('session.is_ranked=true → isRanked true for new-game path', async () => {
    mockGetSessionById.mockResolvedValueOnce({ id: 7, games: [], is_ranked: true });
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalledWith(7));
    await waitFor(() => expect(result.current.isRanked).toBe(true));
  });

  it('session.is_ranked=false → isRanked false for new-game path', async () => {
    mockGetSessionById.mockResolvedValueOnce({ id: 7, games: [], is_ranked: false });
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalledWith(7));
    await waitFor(() => expect(result.current.isRanked).toBe(false));
  });

  it('no session (pickup-new) → isRanked false without fetching session', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(result.current.isRanked).toBe(false);
    // No sessionId → the session-hydration effect must not fire
    expect(mockGetSessionById).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (f) Roster source selection
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — roster source', () => {
  it('uses relevance-ranked searchPlayers for the session roster (not just participants + friends)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => {
      // Roster comes from the full ranked search (session members flagged
      // in_session render as chips; the rest is the whole network) — so a
      // user with few friends still gets the full selection.
      expect(mockSearchPlayers).toHaveBeenCalledWith(
        '',
        expect.objectContaining({ sessionId: 7 }),
      );
      expect(result.current.roster.length).toBe(
        MOCK_LEAGUE_DEFAULT_ROSTER.items.length,
      );
    });
    // Participants are still fetched — for gender/level inference only.
    expect(mockGetSessionParticipants).toHaveBeenCalledWith(7);
    // Friends are NOT the session roster source when search succeeds.
    expect(mockGetFriends).not.toHaveBeenCalled();
  });

  it('uses the same relevance-ranked searchPlayers for pickup-new (no session, no league)', async () => {
    // Pickup with no IDs must surface the caller's full ranked network —
    // identical to league/session flows — NOT a friends-only list.
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => {
      expect(mockSearchPlayers).toHaveBeenCalledWith('', expect.any(Object));
      expect(result.current.roster.length).toBe(
        MOCK_LEAGUE_DEFAULT_ROSTER.items.length,
      );
    });
    // No session/league context, and friends are NOT the primary source.
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
    expect(mockGetFriends).not.toHaveBeenCalled();
  });

  it('falls back to session participants + friends when relevance search is empty', async () => {
    mockSearchPlayers.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => {
      expect(mockGetSessionParticipants).toHaveBeenCalledWith(7);
      expect(mockGetFriends).toHaveBeenCalled();
      // roster = participants (4) + non-duplicate friends (2) = 6
      expect(result.current.roster.length).toBe(
        MOCK_PARTICIPANTS.length + MOCK_FRIENDS_RESPONSE.items.length,
      );
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

  it('fetches the ranked default roster via searchPlayers when only leagueId is provided', async () => {
    mockSearchPlayers.mockResolvedValueOnce({
      items: [
        { id: 50, first_name: 'Marisol', last_name: 'Hart', full_name: 'Marisol Hart', nickname: null, initials: 'MH', tags: ['friend'], score: 15, in_session: false },
        { id: 51, first_name: 'Jordan', last_name: 'Lee', full_name: 'Jordan Lee', nickname: null, initials: 'JL', tags: ['in_league'], score: 150, in_session: false },
      ],
    });

    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => {
      expect(mockSearchPlayers).toHaveBeenCalledWith('', expect.objectContaining({ leagueId: 3 }));
      expect(result.current.roster.length).toBe(2);
    });
    // Pills come straight from the backend `tags`; the league context
    // returns an additively-ranked mix, not just league members.
    const tags = result.current.roster.map((p) => p.tags.join(',')).sort();
    expect(tags).toEqual(['friend', 'in_league']);
    expect(result.current.roster.every((p) => p.isSession === false)).toBe(true);
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
  });

  it('loads one bounded ranked list with no cursor paging', async () => {
    mockSearchPlayers.mockReset();
    mockSearchPlayers.mockResolvedValue({
      items: [
        { id: 60, first_name: 'Page', last_name: 'One', full_name: 'Page One', nickname: null, initials: 'PO', tags: ['in_league'], score: 150, in_session: false },
        { id: 61, first_name: 'Page', last_name: 'Two', full_name: 'Page Two', nickname: null, initials: 'PT', tags: [], score: 0, in_session: false },
      ],
    });

    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBe(2));

    // The whole set arrives in one call; no cursor is ever passed.
    expect(result.current.roster.map((p) => p.player_id)).toEqual([60, 61]);
    expect(mockSearchPlayers).toHaveBeenCalledTimes(1);
    expect(mockSearchPlayers).toHaveBeenCalledWith(
      '',
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
    // loadMore / hasMore / isLoadingMore no longer exist on the result.
    expect('loadMore' in result.current).toBe(false);
    expect('hasMore' in result.current).toBe(false);
  });

  it('uses the ranked network (not friends) when neither sessionId nor leagueId is provided', async () => {
    // Pickup-new runs the identical relevance search as every other flow; it
    // never special-cases the friends list as the primary roster source.
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => {
      expect(mockSearchPlayers).toHaveBeenCalledWith('', expect.any(Object));
      expect(result.current.roster.length).toBe(
        MOCK_LEAGUE_DEFAULT_ROSTER.items.length,
      );
    });
    expect(mockGetFriends).not.toHaveBeenCalled();
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
  });

  it('falls back to friends only when the ranked search returns nothing (pickup-new)', async () => {
    mockSearchPlayers.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => {
      expect(mockGetFriends).toHaveBeenCalled();
      expect(result.current.roster.length).toBe(MOCK_FRIENDS_RESPONSE.items.length);
    });
    expect(mockGetSessionParticipants).not.toHaveBeenCalled();
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
  });

  it('passes both sessionId and leagueId to searchPlayers, never calling league members API', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7, leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(mockGetSessionParticipants).toHaveBeenCalledWith(7);
    expect(mockGetLeagueMembers).not.toHaveBeenCalled();
    // Session roster uses the relevance search, scoped to both contexts so
    // session members are flagged and league members rank highly.
    expect(mockSearchPlayers).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ sessionId: 7, leagueId: 3 }),
    );
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

  it('shows full roster (caller seated at the head) when search is empty', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    // Wait for the caller fetch to resolve so the YOU chip is injected.
    await waitFor(() => expect(result.current.currentPlayerId).toBe(77));

    act(() => {
      result.current.setSearch('');
    });

    // The caller (id 77, not part of the backend roster) leads the list as a
    // session chip, followed by the full backend roster.
    expect(result.current.filteredRoster.length).toBe(
      result.current.roster.length + 1,
    );
    expect(result.current.filteredRoster[0].player_id).toBe(77);
    expect(result.current.filteredRoster[0].isSession).toBe(true);
    expect(result.current.filteredRoster.slice(1)).toEqual(
      result.current.roster,
    );
  });

  it('seats the caller into the picker even though the backend search excludes them, and drops the chip once they are on a team', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.currentPlayerId).toBe(77));

    // The caller appears as their own chip (the backend never returns them).
    const self = result.current.filteredRoster.find((p) => p.player_id === 77);
    expect(self).toBeDefined();
    expect(self?.isSession).toBe(true);

    // Once seated, the scoreboard owns their display — the chip leaves the
    // picker so it doesn't steal scroll space.
    act(() => {
      result.current.assignPlayer(1, 0, self!);
    });
    expect(
      result.current.filteredRoster.some((p) => p.player_id === 77),
    ).toBe(false);
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
      result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'A', initials: 'A', tags: [], isSession: false });
      result.current.assignPlayer(1, 1, { player_id: 11, display_name: 'B', initials: 'B', tags: [], isSession: false });
      result.current.assignPlayer(2, 0, { player_id: 12, display_name: 'C', initials: 'C', tags: [], isSession: false });
      result.current.assignPlayer(2, 1, { player_id: 13, display_name: 'D', initials: 'D', tags: [], isSession: false });
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

// ---------------------------------------------------------------------------
// (h) scoreWarning — incomplete score (< 10 not tied)
// ---------------------------------------------------------------------------

/** Fill the 4 slots without setting any score. */
function fillSlotsOnly(
  result: ReturnType<typeof renderHook<ReturnType<typeof useScoreGameScreen>, unknown>>['result'],
): void {
  act(() => {
    result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'A', initials: 'A', tags: [], isSession: false });
    result.current.assignPlayer(1, 1, { player_id: 11, display_name: 'B', initials: 'B', tags: [], isSession: false });
    result.current.assignPlayer(2, 0, { player_id: 12, display_name: 'C', initials: 'C', tags: [], isSession: false });
    result.current.assignPlayer(2, 1, { player_id: 13, display_name: 'D', initials: 'D', tags: [], isSession: false });
  });
}

describe('useScoreGameScreen — scoreWarning incomplete', () => {
  it('warns when both scores < 10 and not tied (5-3)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    act(() => {
      result.current.setScore1(5);
      result.current.setScore2(3);
    });

    expect(result.current.scoreWarning).toBe('Scores look incomplete — save anyway?');
  });

  it('warns when only one team has scored (0-5)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    act(() => {
      result.current.setScore1(0);
      result.current.setScore2(5);
    });

    expect(result.current.scoreWarning).toBe('Scores look incomplete — save anyway?');
  });

  it('warns when scores 9-5 (near but under threshold)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    act(() => {
      result.current.setScore1(9);
      result.current.setScore2(5);
    });

    expect(result.current.scoreWarning).toBe('Scores look incomplete — save anyway?');
  });

  it('does not warn when at least one score is >= 10 (10-8)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    act(() => {
      result.current.setScore1(10);
      result.current.setScore2(8);
    });

    expect(result.current.scoreWarning).toBeNull();
  });

  it('keeps both-zero warning ahead of incomplete check (0-0)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    expect(result.current.scoreWarning).toBe('Enter scores to save');
  });

  it('keeps tied warning ahead of incomplete check (5-5)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    fillSlotsOnly(result);
    act(() => {
      result.current.setScore1(5);
      result.current.setScore2(5);
    });

    expect(result.current.scoreWarning).toBe('Scores are tied — beach volleyball has no ties');
  });

  it('does not warn while still building (<4 slots filled)', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.assignPlayer(1, 0, { player_id: 10, display_name: 'A', initials: 'A', tags: [], isSession: false });
      result.current.setScore1(5);
      result.current.setScore2(3);
    });

    expect(result.current.scoreWarning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (i) currentPlayerId — explicit option vs api fallback
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — currentPlayerId', () => {
  it('exposes currentPlayerId from the option without calling the API', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ currentPlayerId: 99 }),
    );
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    expect(result.current.currentPlayerId).toBe(99);
    expect(mockGetCurrentUserPlayer).not.toHaveBeenCalled();
  });

  it('fetches currentPlayerId from api.getCurrentUserPlayer when option not passed', async () => {
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(mockGetCurrentUserPlayer).toHaveBeenCalled());
    await waitFor(() => expect(result.current.currentPlayerId).toBe(77));
  });

  it('stays null when api.getCurrentUserPlayer rejects', async () => {
    mockGetCurrentUserPlayer.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useScoreGameScreen({}));
    await waitFor(() => expect(mockGetCurrentUserPlayer).toHaveBeenCalled());
    // currentPlayerId initial value is null; failure leaves it null
    expect(result.current.currentPlayerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (j) Edit mode — pre-fill, update, delete
// ---------------------------------------------------------------------------

const MOCK_EDIT_GAME = {
  id: 555,
  game_number: 2,
  team1_player1_id: 10,
  team1_player2_id: 11,
  team2_player1_id: 12,
  team2_player2_id: 13,
  team1_player1_name: 'Chris Gulla',
  team1_player2_name: 'Kyle Fawwar',
  team2_player1_name: 'Alex Marthey',
  team2_player2_name: 'Sam Jindash',
  team1_score: 21,
  team2_score: 15,
  winner: 1 as const,
  rating_change: null,
  is_ranked: true,
};

describe('useScoreGameScreen — edit mode', () => {
  beforeEach(() => {
    mockGetSessionById.mockResolvedValue({ id: 7, games: [MOCK_EDIT_GAME] });
  });

  it('sets isEditMode true when matchId is provided', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );
    expect(result.current.isEditMode).toBe(true);
  });

  it('isEditMode is false without matchId', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    expect(result.current.isEditMode).toBe(false);
  });

  it('pre-fills slots from the matching game in session detail', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));
    expect(result.current.team1[1].player_id).toBe(11);
    expect(result.current.team2[0].player_id).toBe(12);
    expect(result.current.team2[1].player_id).toBe(13);
    expect(result.current.team1[0].display_name).toBe('Chris Gulla');
  });

  it('pre-fills scores and is_ranked from the game', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.score1).toBe(21));
    expect(result.current.score2).toBe(15);
    expect(result.current.isRanked).toBe(true);
  });

  it('leaves form empty when matching game is not in session detail', async () => {
    mockGetSessionById.mockResolvedValue({ id: 7, games: [] });
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalled());
    expect(result.current.team1[0].player_id).toBeNull();
    expect(result.current.score1).toBe(0);
  });

  it('fetches session detail for is_ranked hydration even when matchId is null', async () => {
    // When adding a new game to an existing session, we still fetch the session
    // once to read session.is_ranked — the edit-mode pre-fill path is NOT taken
    // (no slot/score hydration occurs).
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalledWith(7));
    // Slots remain empty — session fetch was only for is_ranked, not pre-fill.
    expect(result.current.team1[0].player_id).toBeNull();
    expect(result.current.score1).toBe(0);
  });

  it('onSubmit calls updateMatch (not submitScoredGame) with all 4 IDs + scores', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));
    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(mockUpdateMatch).toHaveBeenCalled());
    expect(mockSubmitScoredGame).not.toHaveBeenCalled();

    const [calledMatchId, payload] = mockUpdateMatch.mock.calls[0];
    expect(calledMatchId).toBe(555);
    expect(payload).toMatchObject({
      team1_player1_id: 10,
      team1_player2_id: 11,
      team2_player1_id: 12,
      team2_player2_id: 13,
      team1_score: 21,
      team2_score: 15,
      is_ranked: true,
    });
  });

  it('onSubmit success keeps existing sessionId in lastSessionId', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));

    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('success'));
    expect(result.current.lastSessionId).toBe(7);
  });

  it('onSubmit captures updateMatch errors into errorMessage', async () => {
    mockUpdateMatch.mockRejectedValue(new Error('Update boom'));

    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));

    await act(async () => {
      result.current.onSubmit();
    });

    await waitFor(() => expect(result.current.submitState).toBe('error'));
    expect(result.current.errorMessage).toBe('Update boom');
  });

  it('onDelete calls deleteMatch and resets state to idle', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));

    await act(async () => {
      await result.current.onDelete();
    });

    expect(mockDeleteMatch).toHaveBeenCalledWith(555);
    expect(result.current.deleteState).toBe('idle');
  });

  it('onDelete sets deleteState to error and captures message on failure', async () => {
    mockDeleteMatch.mockRejectedValue(new Error('Delete boom'));

    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 555 }),
    );

    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));

    await act(async () => {
      await result.current.onDelete();
    });

    expect(result.current.deleteState).toBe('error');
    expect(result.current.errorMessage).toBe('Delete boom');
  });

  it('onDelete is a no-op without matchId', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));

    await act(async () => {
      await result.current.onDelete();
    });

    expect(mockDeleteMatch).not.toHaveBeenCalled();
  });

  it('onDelete returns true on success, false on failure', async () => {
    mockGetSessionById.mockResolvedValue({
      id: 7,
      games: [
        {
          id: 99,
          game_number: 1,
          team1_player1_id: 10,
          team1_player2_id: 11,
          team2_player1_id: 12,
          team2_player2_id: 13,
          team1_player1_name: 'A',
          team1_player2_name: 'B',
          team2_player1_name: 'C',
          team2_player2_name: 'D',
          team1_score: 21,
          team2_score: 16,
          winner: 1,
          rating_change: null,
          is_ranked: true,
        },
      ],
    });

    const { result } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7, matchId: 99 }),
    );
    await waitFor(() => expect(result.current.team1[0].player_id).toBe(10));

    let okSuccess: boolean | undefined;
    await act(async () => {
      okSuccess = await result.current.onDelete();
    });
    expect(okSuccess).toBe(true);

    mockDeleteMatch.mockRejectedValueOnce(new Error('boom'));
    let okFail: boolean | undefined;
    await act(async () => {
      okFail = await result.current.onDelete();
    });
    expect(okFail).toBe(false);
    expect(result.current.deleteState).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// (j) Three-dot menu — Manage Session lazy create + Share
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — onManageSession / onShareSession', () => {
  it('canShare is false until a session exists', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 8 }),
    );
    // Hook returns synchronously; assert on initial state.
    expect(result.current.canShare).toBe(false);
    expect(result.current.sessionId).toBeNull();
  });

  it('canShare is true when started with an existing sessionId', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));
    expect(result.current.canShare).toBe(true);
  });

  it('onManageSession lazily creates a session when none exists', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 8 }),
    );
    await waitFor(() =>
      expect(mockSearchPlayers).toHaveBeenCalledWith('', expect.objectContaining({ leagueId: 3 })),
    );

    let returnedId: number | null | undefined;
    await act(async () => {
      returnedId = await result.current.onManageSession();
    });

    expect(mockCreateSession).toHaveBeenCalledWith({
      league_id: 3,
      season_id: 8,
    });
    expect(returnedId).toBe(555);
    expect(result.current.sessionId).toBe(555);
    expect(result.current.canShare).toBe(true);
  });

  it('onManageSession is a no-op when sessionId is already set', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 42 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    let returnedId: number | null | undefined;
    await act(async () => {
      returnedId = await result.current.onManageSession();
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(returnedId).toBe(42);
  });

  it('onManageSession surfaces errorMessage on failure and returns null', async () => {
    mockCreateSession.mockRejectedValue(new Error('Session create failed'));
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 8 }),
    );

    let returnedId: number | null | undefined;
    await act(async () => {
      returnedId = await result.current.onManageSession();
    });

    expect(returnedId).toBeNull();
    expect(result.current.errorMessage).toBe('Session create failed');
    expect(result.current.sessionId).toBeNull();
  });

  it('after lazy-create, subsequent onSubmit uses the new sessionId (no double-create)', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 8 }),
    );
    await waitFor(() =>
      expect(mockSearchPlayers).toHaveBeenCalledWith('', expect.objectContaining({ leagueId: 3 })),
    );

    await act(async () => {
      await result.current.onManageSession();
    });
    expect(result.current.sessionId).toBe(555);

    fillSlots(result);

    act(() => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    expect(mockSubmitScoredGame).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 555 }),
    );
    // Only one createSession call — the new sessionId carried through to submit.
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('onSubmit without sessionId captures the backend-created session into sessionId state', async () => {
    mockSubmitScoredGame.mockResolvedValue({
      status: 'success',
      message: 'ok',
      match_id: 1,
      session_id: 777,
    });
    const { result } = renderHook(() => useScoreGameScreen({}));
    fillSlots(result);

    act(() => {
      result.current.onSubmit();
    });
    await waitFor(() => expect(result.current.submitState).toBe('success'));

    expect(result.current.sessionId).toBe(777);
    expect(result.current.canShare).toBe(true);
  });

  it('onShareSession fetches session and calls shareLink with the code', async () => {
    mockGetSessionById.mockResolvedValue({ id: 7, code: 'BKABC123', games: [] });
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.onShareSession();
    });

    expect(mockShareLink).toHaveBeenCalledTimes(1);
    expect(mockShareLink.mock.calls[0][0]).toContain('BKABC123');
  });

  it('onShareSession is a no-op when no session exists', async () => {
    const { result } = renderHook(() =>
      useScoreGameScreen({ leagueId: 3, seasonId: 8 }),
    );

    await act(async () => {
      await result.current.onShareSession();
    });

    expect(mockShareLink).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (k) AddNewPlayer formSheet — request hand-off + result consumption
// ---------------------------------------------------------------------------

describe('useScoreGameScreen — addNewPlayer formSheet', () => {
  // (a) openAddNewPlayer captures the search/target into the bridge request
  // and navigates to the formSheet route.
  it('sets the bridge request from search/target and navigates to the route', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.setSearch('Brad');
    });
    act(() => {
      result.current.openAddNewPlayer({ team: 1, slot: 0 });
    });

    expect(mockBridgeSetRequest).toHaveBeenCalledWith({
      team: 1,
      slot: 0,
      prefillName: 'Brad',
      inferredGender: null,
      inferredLevel: null,
      leagueId: null,
    });
    expect(mockPush).toHaveBeenCalledWith('/(stack)/add-new-player');
  });

  // (b) consuming a returned result seats the guest into the requested slot,
  // sets pendingShareInvite for the toast, and clears the search box.
  it('seats the guest, sets pendingShareInvite, and clears search when a result returns', async () => {
    const { result, rerender } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7 }),
    );
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.setSearch('Brad');
    });

    // Simulate the formSheet creating the placeholder and handing it back.
    await act(async () => {
      mockBridgeResult = {
        team: 1,
        slot: 0,
        name: 'Brad K',
        player_id: 99,
        invite_url: 'https://x/invite/tok',
      };
      rerender({});
    });

    await waitFor(() => {
      expect(result.current.team1[0].player_id).toBe(99);
    });
    expect(result.current.team1[0].display_name).toBe('Brad K');
    expect(result.current.team1[0].is_guest).toBe(true);
    expect(result.current.pendingShareInvite).toEqual({
      name: 'Brad K',
      invite_url: 'https://x/invite/tok',
      team: 1,
    });
    expect(result.current.search).toBe('');
  });

  // (b2) the result is consumed exactly once (consumeResult clears it).
  it('consumes the result so it seats the guest only once', async () => {
    const { result, rerender } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7 }),
    );
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    await act(async () => {
      mockBridgeResult = {
        team: 2,
        slot: 1,
        name: 'Brad K',
        player_id: 99,
        invite_url: 'https://x/invite/tok',
      };
      rerender({});
    });

    await waitFor(() => {
      expect(result.current.team2[1].player_id).toBe(99);
    });
    expect(mockBridgeConsumeResult).toHaveBeenCalled();
    expect(mockBridgeResult).toBeNull();
  });

  // (c) league context → leagueId carried into the request.
  it('carries leagueId into the request when in a league context', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.openAddNewPlayer({ team: 1, slot: 0 });
    });

    expect(mockBridgeSetRequest).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 3 }),
    );
  });

  // (d) inference: league gender 'mens' + level 'advanced' flows into request.
  it('infers gender male and level advanced from a mens/advanced league', async () => {
    mockGetLeague.mockResolvedValueOnce({
      id: 1,
      name: 'Mens Advanced',
      description: null,
      access_type: 'open' as const,
      gender: 'mens',
      level: 'advanced',
      location_id: null,
      location_name: null,
      home_courts: [],
      member_count: 0,
      season_count: 0,
      current_season_id: null,
      current_season_name: null,
      is_active: true,
      user_role: null,
      user_rank: null,
      user_wins: null,
      user_losses: null,
      user_rating: null,
    });

    const { result } = renderHook(() => useScoreGameScreen({ leagueId: 1 }));

    await waitFor(() => {
      act(() => {
        result.current.openAddNewPlayer({ team: 1, slot: 0 });
      });
      expect(mockBridgeSetRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inferredGender: 'male',
          inferredLevel: 'advanced',
        }),
      );
    });
  });

  // (e) inference: session participants mostly female + beginner.
  it('infers gender and level from session participant modal values', async () => {
    const femaleBeginnerParticipants = [
      { player_id: 10, full_name: 'Alice A', level: 'beginner', gender: 'female', location_name: null, is_placeholder: false },
      { player_id: 11, full_name: 'Bob B', level: 'beginner', gender: 'female', location_name: null, is_placeholder: false },
      { player_id: 12, full_name: 'Carol C', level: 'intermediate', gender: 'male', location_name: null, is_placeholder: false },
      { player_id: 13, full_name: 'Dana D', level: 'beginner', gender: 'female', location_name: null, is_placeholder: false },
    ];
    mockGetSessionParticipants.mockResolvedValueOnce(femaleBeginnerParticipants);

    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    await waitFor(() => {
      act(() => {
        result.current.openAddNewPlayer({ team: 1, slot: 0 });
      });
      expect(mockBridgeSetRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inferredGender: 'female',
          inferredLevel: 'beginner',
        }),
      );
    });
  });

  // (f) inference: neither session clues nor league → both null in request.
  it('leaves inferred values null in the request when no clues exist', async () => {
    // MOCK_PARTICIPANTS all have null gender + level (from beforeEach)
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.openAddNewPlayer({ team: 1, slot: 0 });
    });

    expect(mockBridgeSetRequest).toHaveBeenCalledWith(
      expect.objectContaining({ inferredGender: null, inferredLevel: null }),
    );
  });

  it('clearPendingShareInvite nulls the invite', async () => {
    const { result, rerender } = renderHook(() =>
      useScoreGameScreen({ sessionId: 7 }),
    );
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    await act(async () => {
      mockBridgeResult = {
        team: 1,
        slot: 0,
        name: 'Brad K',
        player_id: 99,
        invite_url: 'https://x/invite/tok',
      };
      rerender({});
    });

    await waitFor(() => {
      expect(result.current.pendingShareInvite).not.toBeNull();
    });

    act(() => {
      result.current.clearPendingShareInvite();
    });

    expect(result.current.pendingShareInvite).toBeNull();
  });

  it('is_guest is threaded through assignPlayer for regular (non-guest) players', async () => {
    const { result } = renderHook(() => useScoreGameScreen({ sessionId: 7 }));
    await waitFor(() => expect(result.current.roster.length).toBeGreaterThan(0));

    act(() => {
      result.current.assignPlayer(1, 0, {
        player_id: 10,
        display_name: 'Chris Gulla',
        initials: 'CG',
        tags: [],
        isSession: true,
      });
    });

    // Regular players should not have is_guest set (undefined, not true)
    expect(result.current.team1[0].is_guest).toBeUndefined();
  });
});
