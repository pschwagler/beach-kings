/**
 * Behavior tests for the Score Game modal screen.
 *
 * Covers:
 *   - Scoreboard renders with team 1 and team 2 halves
 *   - Score increment / decrement buttons work (requires all 4 slots filled)
 *   - Score does not go below 0
 *   - Roster picker renders player chips
 *   - Selecting a player assigns them to the active slot
 *   - Save Game button is disabled until all 4 slots filled and score > 0
 *   - Save Game triggers submit (which throws from mock → error state)
 *   - Error state renders with retry + discard buttons
 *   - Retry from error state goes back to idle (scoreboard visible)
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({}));
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

type BeforeRemoveEvent = {
  preventDefault: () => void;
  data: { action: unknown };
};
type BeforeRemoveListener = (e: BeforeRemoveEvent) => void;

/**
 * Capture of the `beforeRemove` listener registered by ScoreGameScreen so
 * tests can simulate hardware-back / swipe-back gestures by invoking it
 * directly. Reset between tests in beforeEach.
 */
const beforeRemoveListeners: BeforeRemoveListener[] = [];
const mockNavDispatch = jest.fn();
const mockNavAddListener = jest.fn(
  (event: string, cb: BeforeRemoveListener) => {
    if (event === 'beforeRemove') {
      beforeRemoveListeners.push(cb);
    }
    return () => {
      const idx = beforeRemoveListeners.indexOf(cb);
      if (idx >= 0) beforeRemoveListeners.splice(idx, 1);
    };
  },
);

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
    useNavigation: () => ({
      addListener: mockNavAddListener,
      dispatch: mockNavDispatch,
    }),
    useLocalSearchParams: () => mockLocalSearchParams(),
    useSegments: () => [],
    useFocusEffect: jest.fn(),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    // Never fire the completion callback synchronously — doing so would trigger
    // onDismiss immediately and clear the toast before test assertions run.
    withTiming: (v: unknown) => v,
    withDelay: (_delay: unknown, v: unknown) => v,
    cancelAnimation: jest.fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { inOut: () => ({}), ease: {}, out: () => ({}) },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  return { __esModule: true, default: Svg, Svg, Path, Circle };
});

const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

const mockSubmitScoredGame = jest.fn();
const mockGetFriends = jest.fn();
const mockGetSessionParticipants = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetLeague = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockUpdateMatch = jest.fn();
const mockDeleteMatch = jest.fn();
const mockGetSessionById = jest.fn();

/** Friends response matching chip IDs used throughout the tests. */
const MOCK_FRIENDS_ROSTER = [
  { id: 10, player_id: 10, full_name: 'C. Gulla', avatar: null, location_name: null, level: null },
  { id: 11, player_id: 11, full_name: 'K. Fawwar', avatar: null, location_name: null, level: null },
  { id: 12, player_id: 12, full_name: 'A. Marthey', avatar: null, location_name: null, level: null },
  { id: 13, player_id: 13, full_name: 'S. Jindash', avatar: null, location_name: null, level: null },
];

const mockShareLink = jest.fn();
const mockSearchPlayers = jest.fn();
const mockCreatePlaceholder = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitScoredGame: (...args: unknown[]) => mockSubmitScoredGame(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
    getSessionParticipants: (...args: unknown[]) => mockGetSessionParticipants(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    updateMatch: (...args: unknown[]) => mockUpdateMatch(...args),
    deleteMatch: (...args: unknown[]) => mockDeleteMatch(...args),
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    searchPlayers: (...args: unknown[]) => mockSearchPlayers(...args),
    createPlaceholder: (...args: unknown[]) => mockCreatePlaceholder(...args),
  },
}));

jest.mock('@/utils/share', () => ({
  shareLink: (...args: unknown[]) => mockShareLink(...args),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colorScheme: 'light' as const,
    themeMode: 'system' as const,
    setThemeMode: jest.fn(),
    isDark: false,
  }),
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    XIcon: makeIcon('XIcon'),
    SearchIcon: makeIcon('SearchIcon'),
    PlusIcon: makeIcon('PlusIcon'),
    CheckIcon: makeIcon('CheckIcon'),
    ShareIcon: makeIcon('ShareIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ScoreGameScreen from '../../../../app/(stack)/score-game';
import AddNewPlayerProvider from '@/contexts/AddNewPlayerContext';
import { AddNewPlayerScreen } from '@/components/screens/Games';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  // Default: throw to exercise error state
  mockSubmitScoredGame.mockRejectedValue(new Error('TODO(backend)'));
  // Roster from friends fallback (no sessionId / leagueId in route params)
  mockGetFriends.mockResolvedValue(MOCK_FRIENDS_ROSTER);
  mockGetSessionParticipants.mockResolvedValue([]);
  mockGetLeagueMembers.mockResolvedValue([]);
  // League-inference effect calls api.getLeague when leagueId is set; a
  // null gender/level means "no inference override" (coed / unknown).
  mockGetLeague.mockResolvedValue({ id: 3, gender: 'coed', level: null });
  // Default: current user is none of the roster players so the YOU badge
  // doesn't accidentally interfere with other test assertions.
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 9999, name: 'Test User' });
  mockUpdateMatch.mockResolvedValue({});
  mockDeleteMatch.mockResolvedValue({});
  mockGetSessionById.mockResolvedValue({ id: 7, games: [] });
  mockShareLink.mockResolvedValue(undefined);
  mockSearchPlayers.mockResolvedValue({ items: [], total_count: 0 });
  mockCreatePlaceholder.mockResolvedValue({
    player_id: 888,
    display_name: 'Brad K',
    invite_url: 'https://beachleague.app/invite/tok123',
  });
  // Reset route params to empty between tests
  mockLocalSearchParams.mockReturnValue({});
  // Drop any beforeRemove listeners captured by the previous test so each
  // test starts with a clean navigation event stream.
  beforeRemoveListeners.length = 0;
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Fill all 4 player slots by tapping chips in roster order.
 * Must be called after roster chips are visible on screen.
 * Score steppers are hidden until all 4 slots are filled (building mode).
 */
async function fillAllSlots(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

  fireEvent.press(screen.getByTestId('team1-slot0'));
  fireEvent.press(screen.getByTestId('roster-chip-10'));

  fireEvent.press(screen.getByTestId('team1-slot1'));
  fireEvent.press(screen.getByTestId('roster-chip-11'));

  fireEvent.press(screen.getByTestId('team2-slot0'));
  fireEvent.press(screen.getByTestId('roster-chip-12'));

  fireEvent.press(screen.getByTestId('team2-slot1'));
  fireEvent.press(screen.getByTestId('roster-chip-13'));
}

/**
 * Renders the score-game route wrapped in AddNewPlayerProvider — mirrors
 * production, where `app/(stack)/_layout.tsx` supplies this context to every
 * stack screen. `useScoreGameScreen` calls `useAddNewPlayer()`, so the
 * provider is mandatory for the screen to mount at all.
 */
function renderScoreGame(): ReturnType<typeof render> {
  return render(
    <AddNewPlayerProvider>
      <ScoreGameScreen />
    </AddNewPlayerProvider>,
  );
}

/**
 * Like {@link renderScoreGame} but also wires a minimal navigation harness so
 * the add-new-player formSheet (a sibling route in production) lives under the
 * same provider. `router.push('/(stack)/add-new-player')` mounts the sheet
 * component and `router.back()` unmounts it — the exact lifecycle the real
 * stack navigator gives it. The AddNewPlayerContext bridge carries the request
 * in and the created player back out, identical to production.
 */
function renderScoreGameWithSheet(): ReturnType<typeof render> {
  function Harness(): React.ReactNode {
    const [sheetOpen, setSheetOpen] = React.useState(false);
    React.useEffect(() => {
      mockPush.mockImplementation((href: unknown) => {
        if (String(href).includes('add-new-player')) setSheetOpen(true);
      });
      mockBack.mockImplementation(() => setSheetOpen(false));
    }, []);
    return (
      <AddNewPlayerProvider>
        <ScoreGameScreen />
        {sheetOpen ? <AddNewPlayerScreen /> : null}
      </AddNewPlayerProvider>
    );
  }
  return render(<Harness />);
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — scoreboard', () => {
  it('renders the scoreboard', async () => {
    renderScoreGame();
    expect(screen.getByTestId('scoreboard')).toBeTruthy();
  });

  it('renders initial score 00 for both teams after slots are filled', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1').props.children).toBe('00');
      expect(screen.getByTestId('score-display-team2').props.children).toBe('00');
    });
  });

  it('enters team 1 score via numpad', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1').props.children).toBe('01');
    });
  });

  it('enters team 2 score via numpad after pressing NEXT', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-next')); // advance to team 2
    fireEvent.press(screen.getByTestId('numpad-1'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team2').props.children).toBe('01');
    });
  });

  it('delete on empty buffer resets team 1 score to 00', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-delete')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-delete'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1').props.children).toBe('00');
    });
  });
});

// ---------------------------------------------------------------------------
// Roster picker
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — roster picker', () => {
  it('renders the roster picker', async () => {
    renderScoreGame();
    expect(screen.getByTestId('roster-picker')).toBeTruthy();
  });

  it('renders player chips in the roster', async () => {
    renderScoreGame();
    // Roster is fetched async — wait for chips to appear
    await waitFor(() => {
      expect(screen.getByTestId('roster-chip-10')).toBeTruthy(); // C. Gulla
      expect(screen.getByTestId('roster-chip-11')).toBeTruthy(); // K. Fawwar
    });
  });

  it('filters roster chips based on search input', async () => {
    renderScoreGame();
    // Wait for roster to load first
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('roster-search-input'), 'Gulla');
    await waitFor(() => {
      expect(screen.getByTestId('roster-chip-10')).toBeTruthy();
      expect(screen.queryByTestId('roster-chip-11')).toBeNull();
    });
  });

  it('queries the backend search endpoint when the user types', async () => {
    // Backend returns a player who is NOT in the pre-loaded roster — proving
    // the picker now reaches beyond locally-cached friends. The empty-q load
    // (every flow's default roster source) must stay empty so the initial
    // picker still comes from the friends fallback; only the typed query
    // returns Daniel.
    mockSearchPlayers.mockImplementation((q: string) =>
      q === ''
        ? Promise.resolve({ items: [], total_count: 0 })
        : Promise.resolve({
            items: [
              {
                id: 999,
                full_name: 'Daniel M',
                nickname: null,
                initials: 'DM',
                relation: 'other',
              },
            ],
            total_count: 1,
          }),
    );

    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('roster-search-input'), 'Daniel');

    await waitFor(() => {
      expect(mockSearchPlayers).toHaveBeenCalled();
      expect(screen.getByTestId('roster-chip-999')).toBeTruthy();
    });
  });

  it('removes seated players from the picker to free up search space', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    // Seat player 10 in team1 slot 0
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    // After being seated, player 10 should disappear from the picker — they're
    // already visible on the scoreboard.
    await waitFor(() => {
      expect(screen.queryByTestId('roster-chip-10')).toBeNull();
      // Other players still visible
      expect(screen.getByTestId('roster-chip-11')).toBeTruthy();
    });
  });

  it('clears the search input after a player is added so the next search starts fresh', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    // Activate a slot, then search for a player.
    fireEvent.press(screen.getByTestId('team1-slot0'));
    const input = screen.getByTestId('roster-search-input');
    fireEvent.changeText(input, 'Gulla');
    await waitFor(() => expect(input.props.value).toBe('Gulla'));

    // Add the matched player — the search should reset for the next pick.
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    await waitFor(() => expect(input.props.value).toBe(''));
  });

  it('ranks a league member above a friend in a league match (one ranked list, in_league pill)', async () => {
    mockLocalSearchParams.mockReturnValue({ leagueId: '3' });
    // Relevance-ranked design: a single bounded list ordered by the backend's
    // additive score. The league member outscores the friend, so its row
    // renders first and carries the `in_league` pill — there is no separate
    // "League members" section anymore.
    mockSearchPlayers.mockResolvedValue({
      items: [
        {
          id: 901,
          first_name: 'Liam',
          last_name: 'League',
          full_name: 'Liam League',
          nickname: null,
          initials: 'LL',
          tags: ['in_league'],
          score: 150,
          in_session: false,
        },
        {
          id: 902,
          first_name: 'Fiona',
          last_name: 'Friend',
          full_name: 'Fiona Friend',
          nickname: null,
          initials: 'FF',
          tags: ['friend'],
          score: 15,
          in_session: false,
        },
      ],
    });

    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-picker')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('roster-search-input'), 'i');

    await waitFor(() => {
      expect(screen.getByTestId('roster-row-901')).toBeTruthy();
      expect(screen.getByTestId('roster-row-902')).toBeTruthy();
    });

    // League membership is conveyed by a pill, not a bucket section.
    expect(screen.getByTestId('roster-pill-in_league')).toBeTruthy();

    // Single ranked list: the higher-scored league member renders first.
    const rowOrder = screen
      .getAllByTestId(/^roster-row-/)
      .map((node) => node.props.testID as string);
    expect(rowOrder.indexOf('roster-row-901')).toBeLessThan(
      rowOrder.indexOf('roster-row-902'),
    );

    // S2: the search-row avatar is seeded by player_id (not a flat "brand"
    // variant) so this player renders the same color here as everywhere else.
    // 901 % 6 === 1 → second variety entry (#fed7aa).
    expect(
      StyleSheet.flatten(screen.getByLabelText('Liam League').props.style),
    ).toEqual(expect.objectContaining({ backgroundColor: '#fed7aa' }));
  });
});

// ---------------------------------------------------------------------------
// Save Game button
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — save game button', () => {
  it('renders the Save Game button', async () => {
    renderScoreGame();
    expect(screen.getByTestId('save-game-btn')).toBeTruthy();
  });

  it('Save Game button is disabled when no players are assigned', async () => {
    renderScoreGame();
    const btn = screen.getByTestId('save-game-btn');
    // The button is rendered but cannot submit (canSubmit=false)
    expect(btn).toBeTruthy();
    // Try pressing it — submit should NOT be called
    fireEvent.press(btn);
    await waitFor(() => {
      expect(mockSubmitScoredGame).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Error flow
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — error state after submit', () => {
  async function fillAndSubmit(): Promise<void> {
    renderScoreGame();

    await fillAllSlots();

    // Switch to scoring mode (all 4 filled) then set score > 0
    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1'));

    // Press Save Game
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-game-btn'));
    });
  }

  it('renders error state after submit fails', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-error-view')).toBeTruthy();
    });
  });

  it('renders retry and discard buttons in error state', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-retry-btn')).toBeTruthy();
      expect(screen.getByTestId('score-discard-btn')).toBeTruthy();
    });
  });

  it('returns to scoreboard when retry is pressed', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('score-retry-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('scoreboard')).toBeTruthy();
    });
  });

  it('navigates back when discard is pressed', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-discard-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('score-discard-btn'));
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Success flow
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — success state after submit', () => {
  beforeEach(() => {
    mockSubmitScoredGame.mockResolvedValue({
      status: 'success',
      message: 'Game created successfully',
      match_id: 999,
      session_id: 42,
    });
  });

  async function fillAndSubmit(): Promise<void> {
    renderScoreGame();

    await fillAllSlots();

    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-game-btn'));
    });
  }

  it('renders success view after successful submit', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-success-view')).toBeTruthy();
    });
  });

  it('renders Done button in success view', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('done-btn')).toBeTruthy();
    });
  });

  it('navigates to session screen when Done is pressed', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('done-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('done-btn'));
    // lastSessionId = 42 from the mock response → router.replace navigates to session detail
    expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/42');
  });
});

// ---------------------------------------------------------------------------
// Score increment upper clamp (99)
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — score upper clamp', () => {
  it('entering two digits caps team 1 score and auto-advances to team 2', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-9')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-9'));
    fireEvent.press(screen.getByTestId('numpad-9'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1').props.children).toBe('99');
    });
  });

  it('entering two digits caps team 2 score at 99', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-9')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-next')); // advance to team 2
    fireEvent.press(screen.getByTestId('numpad-9'));
    fireEvent.press(screen.getByTestId('numpad-9'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team2').props.children).toBe('99');
    });
  });
});

// ---------------------------------------------------------------------------
// Success view content (player-name desc + combined final score)
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — success view content', () => {
  beforeEach(() => {
    mockSubmitScoredGame.mockResolvedValue({
      status: 'success',
      message: 'Game created successfully',
      match_id: 999,
      session_id: 42,
    });
  });

  async function fillAndSubmit(): Promise<void> {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-game-btn'));
    });
  }

  it('renders "X / Y beat A / B" desc with player short names', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      const desc = screen.getByTestId('score-success-desc');
      // Structure check: "<name> / <name> beat <name> / <name>". We avoid
      // pinning exact fixture names so renaming roster players in MOCK_FRIENDS
      // doesn't break this test.
      expect(desc.props.children).toMatch(
        /^.+ \/ .+ beat .+ \/ .+$/,
      );
    });
  });

  it('blocks a tied score and explains how to fix it', async () => {
    renderScoreGame();
    await fillAllSlots();
    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1')); // team 1 score = 1
    fireEvent.press(screen.getByTestId('numpad-next')); // advance to team 2
    fireEvent.press(screen.getByTestId('numpad-1')); // team 2 score = 1

    const saveButton = screen.getByTestId('save-game-btn');
    expect(saveButton.props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    const validationMessage = screen.getByText(
      'Choose a winner by changing one score. Games cannot end in a tie.',
    );
    expect(validationMessage.props.accessibilityRole).toBe('alert');

    fireEvent.press(saveButton);
    expect(mockSubmitScoredGame).not.toHaveBeenCalled();
  });

  it('renders single Final Score row instead of separate team scores', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('1-0')).toBeTruthy();
      expect(screen.getByText('Final Score')).toBeTruthy();
    });
    // No separate "Team 1"/"Team 2" mini score columns
    expect(screen.queryByText('Team 1')).toBeNull();
    expect(screen.queryByText('Team 2')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Header + subtitle from route params
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — header and subtitle from params', () => {
  it('renders "Add Game" by default', async () => {
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByText('Add Game')).toBeTruthy();
    });
  });

  it('renders custom headerTitle when passed as route param', async () => {
    mockLocalSearchParams.mockReturnValue({ headerTitle: 'Continue Session' });
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByText('Continue Session')).toBeTruthy();
    });
  });

  it('renders "Game #N · sessionLabel" subtitle when both params present', async () => {
    mockLocalSearchParams.mockReturnValue({
      gameNumber: '3',
      sessionLabel: 'Sunday at QBK',
    });
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByText('Game #3 · Sunday at QBK')).toBeTruthy();
    });
  });

  it('renders sessionLabel alone when gameNumber missing', async () => {
    mockLocalSearchParams.mockReturnValue({
      sessionLabel: 'Sunday League',
    });
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByText('Sunday League')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Discard-on-close guard (Task 2)
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — discard-on-close guard', () => {
  it('navigates back silently when X is pressed with an empty board', async () => {
    renderScoreGame();
    // Wait for the screen to be ready (modal-close-btn is part of the nav header).
    await waitFor(() => expect(screen.getByTestId('modal-close-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('modal-close-btn'));
    // No sessionId in route params → router.back() is invoked, no dialog shown.
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
    // The destructive confirm button should NOT be in the tree.
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
  });

  it('shows the discard dialog when X is pressed after a player is added', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    // Add a single player (enough to register progress).
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    fireEvent.press(screen.getByTestId('modal-close-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('discard-confirm-dialog-confirm')).toBeTruthy();
      expect(screen.getByTestId('discard-confirm-dialog-cancel')).toBeTruthy();
    });
    // No navigation should have happened yet — user is still deciding.
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Keep Scoring dismisses the dialog without navigating', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('modal-close-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('discard-confirm-dialog-cancel')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('discard-confirm-dialog-cancel'));

    await waitFor(() => {
      // After cancel the modal collapses (RNModal renders null when not visible).
      expect(screen.queryByTestId('discard-confirm-dialog-cancel')).toBeNull();
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('Discard confirms and navigates back', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('modal-close-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('discard-confirm-dialog-confirm')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('discard-confirm-dialog-confirm'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('does not re-open the dialog when Discard fires beforeRemove', async () => {
    // Regression: a previous version cleared the dialog and called
    // router.back(), which fired the beforeRemove listener. Because slots
    // were still filled, the listener re-opened the dialog — forcing the
    // user to tap Discard twice. Replay that here and assert the dialog
    // doesn't come back.
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('modal-close-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('discard-confirm-dialog-confirm')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('discard-confirm-dialog-confirm'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());

    // Simulate what router.back() triggers internally — the beforeRemove
    // listener firing on the in-progress slots. With the bug, this would
    // re-open the dialog; with the fix, skipGuardRef is set and the
    // listener short-circuits.
    const preventDefault = jest.fn();
    const listener = beforeRemoveListeners[beforeRemoveListeners.length - 1];
    if (listener != null) {
      act(() => {
        listener({ preventDefault, data: { action: { type: 'GO_BACK' } } });
      });
    }

    expect(preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
  });

  it('replaces to session detail on close when sessionId is present and no progress', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '42' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('modal-close-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('modal-close-btn'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/42');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// beforeRemove guard — hardware-back / iOS swipe-back gesture
// ---------------------------------------------------------------------------

/** Fire the most recently registered beforeRemove listener with the given action. */
function fireBeforeRemove(action: unknown = { type: 'GO_BACK' }): {
  preventDefault: jest.Mock;
} {
  const preventDefault = jest.fn();
  const listener = beforeRemoveListeners[beforeRemoveListeners.length - 1];
  if (listener == null) {
    throw new Error('No beforeRemove listener registered yet');
  }
  act(() => {
    listener({ preventDefault, data: { action } });
  });
  return { preventDefault };
}

describe('ScoreGameScreen — beforeRemove guard (back-gesture / hardware-back)', () => {
  it('lets navigation proceed with empty board (preventDefault not called)', async () => {
    renderScoreGame();
    await waitFor(() => expect(mockNavAddListener).toHaveBeenCalled());

    const { preventDefault } = fireBeforeRemove();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
  });

  it('prevents removal and shows discard dialog when there is progress', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    const { preventDefault } = fireBeforeRemove();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId('discard-confirm-dialog-confirm')).toBeTruthy();
    });
  });

  it('replays the captured navigation action when Discard is confirmed', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    const capturedAction = { type: 'POP', payload: { count: 1 } };
    fireBeforeRemove(capturedAction);

    await waitFor(() =>
      expect(screen.getByTestId('discard-confirm-dialog-confirm')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('discard-confirm-dialog-confirm'));

    await waitFor(() => {
      expect(mockNavDispatch).toHaveBeenCalledWith(capturedAction);
    });
    // Router fallbacks should NOT fire when we're replaying a captured action;
    // the gesture's original target governs the destination.
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('clears the captured action when Keep Scoring is pressed', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    fireBeforeRemove({ type: 'GO_BACK' });

    await waitFor(() =>
      expect(screen.getByTestId('discard-confirm-dialog-cancel')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('discard-confirm-dialog-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('discard-confirm-dialog-cancel')).toBeNull(),
    );
    expect(mockNavDispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Loading lock — block close while a save is in flight
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — loading lock', () => {
  async function fillAndSubmitHanging(): Promise<void> {
    // Submit hangs forever so the screen stays in 'loading' for the test.
    mockSubmitScoredGame.mockReturnValue(new Promise(() => {}));

    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('team1-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-11'));
    fireEvent.press(screen.getByTestId('team2-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-12'));
    fireEvent.press(screen.getByTestId('team2-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-13'));

    await waitFor(() => expect(screen.getByTestId('numpad-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('numpad-1'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('save-game-btn'));
    });
  }

  it('disables the modal close button while saving', async () => {
    await fillAndSubmitHanging();
    await waitFor(() => {
      const closeBtn = screen.getByTestId('modal-close-btn');
      expect(closeBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });

  it('does not show the discard dialog when X is pressed while saving', async () => {
    await fillAndSubmitHanging();
    fireEvent.press(screen.getByTestId('modal-close-btn'));
    // Allow any pending micro-tasks to flush.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('silently blocks back-gesture while saving (no dialog, preventDefault called)', async () => {
    await fillAndSubmitHanging();

    const { preventDefault } = fireBeforeRemove({ type: 'GO_BACK' });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "YOU" badge — current user identified in the picker
// ---------------------------------------------------------------------------

/**
 * Session-participant shape used by the YOU-badge tests. The badge lives on
 * the compact `SessionChip` (source='session'); friend-row layout intentionally
 * does not show it, so these tests route through getSessionParticipants by
 * passing a sessionId in route params.
 */
const MOCK_PARTICIPANT_ROSTER = [
  { player_id: 10, full_name: 'C. Gulla', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 11, full_name: 'K. Fawwar', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 12, full_name: 'A. Marthey', level: null, gender: null, location_name: null, is_placeholder: false },
  { player_id: 13, full_name: 'S. Jindash', level: null, gender: null, location_name: null, is_placeholder: false },
];

describe('ScoreGameScreen — current user YOU badge', () => {
  beforeEach(() => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '42' });
    mockGetSessionParticipants.mockResolvedValue(MOCK_PARTICIPANT_ROSTER);
    mockGetFriends.mockResolvedValue([]);
    // Mock the current player to match a roster player so the YOU badge appears.
    mockGetCurrentUserPlayer.mockResolvedValue({ id: 10, name: 'C. Gulla' });
  });

  it('renders YOU pill on the current user chip when not seated', async () => {
    renderScoreGame();
    await waitFor(() =>
      expect(screen.getByTestId('roster-chip-10-you-badge')).toBeTruthy(),
    );
    // Other session chips do NOT get a YOU badge.
    expect(screen.queryByTestId('roster-chip-11-you-badge')).toBeNull();
    expect(screen.queryByTestId('roster-chip-12-you-badge')).toBeNull();
  });

  it('hides YOU pill once the current user is seated on a team', async () => {
    renderScoreGame();
    await waitFor(() =>
      expect(screen.getByTestId('roster-chip-10-you-badge')).toBeTruthy(),
    );

    // Seat the current user on team 1, slot 0.
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    await waitFor(() =>
      expect(screen.queryByTestId('roster-chip-10-you-badge')).toBeNull(),
    );
  });

  it('still seats the caller as their own YOU chip when the backend roster excludes them', async () => {
    // The relevance search deliberately omits the caller; the picker injects
    // them client-side so they can add themselves to a team.
    mockGetCurrentUserPlayer.mockResolvedValue({ id: 9999, name: 'Outsider' });
    renderScoreGame();
    await waitFor(() =>
      expect(screen.getByTestId('roster-chip-9999-you-badge')).toBeTruthy(),
    );
    expect(screen.getByTestId('roster-chip-9999')).toBeTruthy();
    // No other chip is mistaken for the caller.
    expect(screen.queryByTestId('roster-chip-10-you-badge')).toBeNull();
    expect(screen.queryByTestId('roster-chip-11-you-badge')).toBeNull();
    expect(screen.queryByTestId('roster-chip-12-you-badge')).toBeNull();
    expect(screen.queryByTestId('roster-chip-13-you-badge')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edit mode (Task 3)
// ---------------------------------------------------------------------------

const EDIT_GAME = {
  id: 555,
  game_number: 2,
  team1_player1_id: 10,
  team1_player2_id: 11,
  team2_player1_id: 12,
  team2_player2_id: 13,
  team1_player1_name: 'C. Gulla',
  team1_player2_name: 'K. Fawwar',
  team2_player1_name: 'A. Marthey',
  team2_player2_name: 'S. Jindash',
  team1_score: 21,
  team2_score: 15,
  winner: 1 as const,
  rating_change: null,
  is_ranked: true,
};

describe('ScoreGameScreen — edit mode', () => {
  beforeEach(() => {
    mockGetSessionById.mockResolvedValue({ id: 7, games: [EDIT_GAME] });
    // Edit-mode flows should reach the Save / Delete UI on first render, so
    // override the default rejected submit mock for happy-path assertions.
    mockSubmitScoredGame.mockResolvedValue({
      status: 'success',
      session_id: 7,
      match_id: 555,
    });
  });

  it('renders "Edit Game" title when matchId is set and headerTitle is not provided', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByText('Edit Game')).toBeTruthy();
    });
  });

  it('shows the Delete Game link only in edit mode', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => {
      expect(screen.getByTestId('delete-game-link')).toBeTruthy();
    });
  });

  it('does not show the Delete Game link without a matchId', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7' });
    renderScoreGame();
    // Roster chips render once the screen settles; assert no Delete link is
    // present once we know the screen is fully rendered.
    await waitFor(() => expect(screen.getByTestId('save-game-btn')).toBeTruthy());
    expect(screen.queryByTestId('delete-game-link')).toBeNull();
  });

  it('tapping Delete opens the confirm dialog', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('delete-game-link')).toBeTruthy());

    fireEvent.press(screen.getByTestId('delete-game-link'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-confirm-dialog')).toBeTruthy();
      expect(screen.getByText('Delete this game?')).toBeTruthy();
    });
  });

  it('confirming Delete calls deleteMatch and navigates back', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('delete-game-link')).toBeTruthy());

    fireEvent.press(screen.getByTestId('delete-game-link'));
    await waitFor(() =>
      expect(screen.getByTestId('delete-confirm-dialog-confirm')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-confirm-dialog-confirm'));
    });

    await waitFor(() => expect(mockDeleteMatch).toHaveBeenCalledWith(555));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('cancelling Delete leaves the dialog and does not call deleteMatch', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('delete-game-link')).toBeTruthy());

    fireEvent.press(screen.getByTestId('delete-game-link'));
    await waitFor(() =>
      expect(screen.getByTestId('delete-confirm-dialog-cancel')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('delete-confirm-dialog-cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Delete this game?')).toBeNull();
    });
    expect(mockDeleteMatch).not.toHaveBeenCalled();
  });

  it('failed delete keeps the screen open and surfaces the error', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    mockDeleteMatch.mockRejectedValue(new Error('Cannot delete'));
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('delete-game-link')).toBeTruthy());

    fireEvent.press(screen.getByTestId('delete-game-link'));
    await waitFor(() =>
      expect(screen.getByTestId('delete-confirm-dialog-confirm')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-confirm-dialog-confirm'));
    });

    await waitFor(() => expect(mockDeleteMatch).toHaveBeenCalledWith(555));
    // No navigation away on failure — user stays on the score screen.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('pressing X in edit mode navigates away without showing the discard dialog', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('modal-close-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('modal-close-btn'));

    // No confirmation dialog — edit mode skips the guard.
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
    // Navigation should have fired.
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalled(),
    );
  });

  it('back-gesture in edit mode does not show the discard dialog', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7', matchId: '555' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('modal-close-btn')).toBeTruthy());

    const preventDefault = jest.fn();
    const listener = beforeRemoveListeners[beforeRemoveListeners.length - 1];
    if (listener == null) throw new Error('No beforeRemove listener registered');

    act(() => {
      listener({ preventDefault, data: { action: { type: 'GO_BACK' } } });
    });

    // Guard must NOT block navigation in edit mode.
    expect(preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByTestId('discard-confirm-dialog-confirm')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Three-dot menu — explicit Start/Edit Session + Share
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — three-dot menu', () => {
  it('renders the three-dot button in idle scoring state', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());
  });

  it('shows Start Session Without Games and hides Share when no session exists', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('score-menu-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('score-menu-manage')).toBeTruthy(),
    );
    expect(screen.getByTestId('score-menu-manage')).toHaveTextContent(
      'Start Session Without Games',
    );
    expect(screen.queryByTestId('score-menu-share')).toBeNull();
  });

  it('Share is visible when sessionId is provided', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('score-menu-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('score-menu-share')).toBeTruthy(),
    );
  });

  it('Start Session opens the explicit form without creating a record', async () => {
    mockLocalSearchParams.mockReturnValue({ leagueId: '3', seasonId: '8' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('score-menu-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('score-menu-manage')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('score-menu-manage'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        '/(stack)/session/create?leagueId=3&seasonId=8',
      ),
    );
  });

  it('passes already selected pickup players into the Start Session form', async () => {
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('team1-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-11'));
    fireEvent.press(screen.getByTestId('score-menu-btn'));
    fireEvent.press(screen.getByTestId('score-menu-manage'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        '/(stack)/session/create?playerIds=10,11',
      ),
    );
  });

  it('Edit Session with an existing sessionId opens the editor', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '42' });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('score-menu-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('score-menu-manage')).toBeTruthy(),
    );
    expect(screen.getByTestId('score-menu-manage')).toHaveTextContent('Edit Session');

    fireEvent.press(screen.getByTestId('score-menu-manage'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/(stack)/session/42/edit'),
    );
  });

  it('Share Session invokes the native share sheet with the session code', async () => {
    mockLocalSearchParams.mockReturnValue({ sessionId: '7' });
    mockGetSessionById.mockResolvedValue({
      id: 7,
      code: 'BKSHARE1',
      games: [],
    });
    renderScoreGame();
    await waitFor(() => expect(screen.getByTestId('score-menu-btn')).toBeTruthy());

    fireEvent.press(screen.getByTestId('score-menu-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('score-menu-share')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('score-menu-share'));
    });

    await waitFor(() => expect(mockShareLink).toHaveBeenCalled());
    expect(mockShareLink.mock.calls[0][0]).toContain('BKSHARE1');
  });
});

// ---------------------------------------------------------------------------
// Add New Player (guest / placeholder) flow — Wave C1 integration
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — Add New Player flow', () => {
  /**
   * Activates team 1 slot 0 (the first slot) then types a search query that
   * won't match any roster player, triggering the "Add as New Player" CTA.
   */
  async function activateSlotAndSearch(query: string): Promise<void> {
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.changeText(screen.getByTestId('roster-search-input'), query);
  }

  it('shows AddNewPlayerSheet when the Add CTA is tapped with a search query', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    // The CTA label is dynamic: Add "<query>" as a New Player
    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    await waitFor(() => {
      expect(screen.getByTestId('add-new-player-sheet')).toBeTruthy();
    });
  });

  it('calls createPlaceholder with correct payload on submit', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    // Sheet is open — prefill sets first="Brad" last="K"
    await waitFor(() =>
      expect(screen.getByTestId('add-new-player-first')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() =>
      expect(mockCreatePlaceholder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Brad K' }),
      ),
    );
  });

  it('seats the guest player in the active slot after creation', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    await waitFor(() =>
      expect(screen.getByTestId('add-new-player-first')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    // Guest player should now occupy team1-slot0 — both the Pressable chip and
    // the Avatar inside share the player's name as their accessibilityLabel.
    await waitFor(() => {
      expect(screen.getAllByLabelText('Brad K').length).toBeGreaterThan(0);
    });
  });

  it('shows ScoreboardToast with "added to Team 1" after creation', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    await waitFor(() =>
      expect(screen.getByTestId('add-new-player-first')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('scoreboard-toast')).toBeTruthy();
      expect(screen.getByTestId('scoreboard-toast-message').props.children).toBe(
        'Brad K added to Team 1',
      );
    });
  });

  it('tapping Share on the toast calls shareLink with the invite URL', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    await waitFor(() =>
      expect(screen.getByTestId('add-new-player-first')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('scoreboard-toast-share')).toBeTruthy(),
    );

    // shareLink should NOT have been called yet (not via this flow — share menu
    // is a separate interaction counted from call #0 forward)
    const callsBefore = mockShareLink.mock.calls.length;

    fireEvent.press(screen.getByTestId('scoreboard-toast-share'));

    await waitFor(() => {
      expect(mockShareLink.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const lastCall = mockShareLink.mock.calls[mockShareLink.mock.calls.length - 1];
    expect(lastCall[0]).toBe('https://beachleague.app/invite/tok123');
  });

  it('AddNewPlayerSheet closes after successful creation', async () => {
    renderScoreGameWithSheet();
    await activateSlotAndSearch('Brad K');

    const cta = await waitFor(() =>
      screen.getByLabelText('Add "Brad K" as a New Player'),
    );
    fireEvent.press(cta);

    await waitFor(() =>
      expect(screen.getByTestId('add-new-player-sheet')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    // After a successful create the sheet calls router.back(); in production
    // that pops the formSheet route, and the harness unmounts AddNewPlayerScreen
    // the same way, so its testID is gone.
    await waitFor(() => {
      expect(screen.queryByTestId('add-new-player-sheet')).toBeNull();
    });
  });
});
