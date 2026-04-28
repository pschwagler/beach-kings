/**
 * Behavior tests for the Score Game modal screen.
 *
 * Covers:
 *   - Scoreboard renders with team 1 and team 2 halves
 *   - Score increment / decrement buttons work
 *   - Score does not go below 0
 *   - Roster picker renders player chips
 *   - Selecting a player assigns them to the active slot
 *   - Save Game button is disabled until all 4 slots filled and score > 0
 *   - Save Game triggers submit (which throws from mock → error state)
 *   - Error state renders with retry + discard buttons
 *   - Retry from error state goes back to idle (scoreboard visible)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
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
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
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

/** Friends response matching chip IDs used throughout the tests. */
const MOCK_FRIENDS_ROSTER = {
  items: [
    { id: 10, player_id: 10, full_name: 'C. Gulla', avatar: null, location_name: null, level: null },
    { id: 11, player_id: 11, full_name: 'K. Fawwar', avatar: null, location_name: null, level: null },
    { id: 12, player_id: 12, full_name: 'A. Marthey', avatar: null, location_name: null, level: null },
    { id: 13, player_id: 13, full_name: 'S. Jindash', avatar: null, location_name: null, level: null },
  ],
  total_count: 4,
};

jest.mock('@/lib/api', () => ({
  api: {
    submitScoredGame: (...args: unknown[]) => mockSubmitScoredGame(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
    getSessionParticipants: (...args: unknown[]) => mockGetSessionParticipants(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
  },
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ScoreGameScreen from '../../../../app/(stack)/score-game';

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
});

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — scoreboard', () => {
  it('renders the scoreboard', async () => {
    render(<ScoreGameScreen />);
    expect(screen.getByTestId('scoreboard')).toBeTruthy();
  });

  it('renders initial score 0 for both teams', async () => {
    render(<ScoreGameScreen />);
    const displays = screen.getAllByText('0');
    expect(displays.length).toBeGreaterThanOrEqual(2);
  });

  it('increments team 1 score when + button is pressed', async () => {
    render(<ScoreGameScreen />);
    fireEvent.press(screen.getByTestId('inc-score-team1'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1')).toHaveTextContent('1');
    });
  });

  it('increments team 2 score when + button is pressed', async () => {
    render(<ScoreGameScreen />);
    fireEvent.press(screen.getByTestId('inc-score-team2'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team2')).toHaveTextContent('1');
    });
  });

  it('does not decrement team 1 score below 0', async () => {
    render(<ScoreGameScreen />);
    fireEvent.press(screen.getByTestId('dec-score-team1'));
    await waitFor(() => {
      expect(screen.getByTestId('score-display-team1')).toHaveTextContent('0');
    });
  });
});

// ---------------------------------------------------------------------------
// Roster picker
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — roster picker', () => {
  it('renders the roster picker', async () => {
    render(<ScoreGameScreen />);
    expect(screen.getByTestId('roster-picker')).toBeTruthy();
  });

  it('renders player chips in the roster', async () => {
    render(<ScoreGameScreen />);
    // Roster is fetched async — wait for chips to appear
    await waitFor(() => {
      expect(screen.getByTestId('roster-chip-10')).toBeTruthy(); // C. Gulla
      expect(screen.getByTestId('roster-chip-11')).toBeTruthy(); // K. Fawwar
    });
  });

  it('filters roster chips based on search input', async () => {
    render(<ScoreGameScreen />);
    // Wait for roster to load first
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('roster-search-input'), 'Gulla');
    await waitFor(() => {
      expect(screen.getByTestId('roster-chip-10')).toBeTruthy();
      expect(screen.queryByTestId('roster-chip-11')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Save Game button
// ---------------------------------------------------------------------------

describe('ScoreGameScreen — save game button', () => {
  it('renders the Save Game button', async () => {
    render(<ScoreGameScreen />);
    expect(screen.getByTestId('save-game-btn')).toBeTruthy();
  });

  it('Save Game button is disabled when no players are assigned', async () => {
    render(<ScoreGameScreen />);
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
  /**
   * Helper: assign all 4 players and set score > 0 so canSubmit=true.
   * We simulate this by pressing player chips to assign to active slots,
   * and incrementing the score.
   */
  async function fillAndSubmit() {
    render(<ScoreGameScreen />);

    // Wait for roster to load async before interacting with chips
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    // Activate team1 slot0, pick C. Gulla
    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));

    // Activate team1 slot1, pick K. Fawwar
    fireEvent.press(screen.getByTestId('team1-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-11'));

    // Activate team2 slot0, pick A. Marthey
    fireEvent.press(screen.getByTestId('team2-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-12'));

    // Activate team2 slot1, pick S. Jindash
    fireEvent.press(screen.getByTestId('team2-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-13'));

    // Set score > 0
    fireEvent.press(screen.getByTestId('inc-score-team1'));

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

  it('returns to scoreboard when discard is pressed', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('score-discard-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('score-discard-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('scoreboard')).toBeTruthy();
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

  async function fillAndSubmit() {
    render(<ScoreGameScreen />);

    // Wait for roster to load async before interacting with chips
    await waitFor(() => expect(screen.getByTestId('roster-chip-10')).toBeTruthy());

    fireEvent.press(screen.getByTestId('team1-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-10'));
    fireEvent.press(screen.getByTestId('team1-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-11'));
    fireEvent.press(screen.getByTestId('team2-slot0'));
    fireEvent.press(screen.getByTestId('roster-chip-12'));
    fireEvent.press(screen.getByTestId('team2-slot1'));
    fireEvent.press(screen.getByTestId('roster-chip-13'));
    fireEvent.press(screen.getByTestId('inc-score-team1'));

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
    // lastSessionId = 42 from the mock response → router.replace is called
    expect(mockReplace).toHaveBeenCalledWith('/session-active?sessionId=42');
  });
});
