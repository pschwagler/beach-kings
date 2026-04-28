/**
 * Behavior tests for the Tournaments List screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Error state on fetch failure, retry works
 *   - Active tournament card renders
 *   - Upcoming empty state when no upcoming tournaments
 *   - Nearby tournaments list renders
 *   - Nearby empty state when no nearby results
 *   - Filter chips render and respond to presses
 *   - Create New button navigates to tournament/create
 *   - Pressing a tournament card navigates to detail
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

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
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
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
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
  };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockListTournaments = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    listTournaments: (...args: unknown[]) => mockListTournaments(...args),
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
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import TournamentsRoute from '../../../../app/(stack)/tournaments';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ACTIVE_TOURNAMENT = {
  id: 1,
  name: 'Spring King of the Beach',
  code: 'SPRING24',
  gender: 'coed',
  format: 'POOLS_PLAYOFFS',
  status: 'ACTIVE',
  num_courts: 4,
  game_to: 21,
  scheduled_date: '2026-05-04',
  player_count: 16,
  current_round: 2,
  created_at: '2026-04-01T12:00:00Z',
};

const MOCK_UPCOMING_TOURNAMENT = {
  id: 2,
  name: 'Summer Slam',
  code: 'SUMMER24',
  gender: 'mens',
  format: 'FULL_ROUND_ROBIN',
  status: 'SETUP',
  num_courts: 3,
  game_to: 25,
  scheduled_date: '2026-07-12',
  player_count: 12,
  current_round: null,
  created_at: '2026-04-10T12:00:00Z',
};

const MOCK_PAST_TOURNAMENT = {
  id: 3,
  name: 'Winter Classic',
  code: 'WINTER24',
  gender: 'coed',
  format: 'POOLS_PLAYOFFS',
  status: 'COMPLETED',
  num_courts: 4,
  game_to: 21,
  scheduled_date: '2026-01-15',
  player_count: 20,
  current_round: null,
  created_at: '2025-12-01T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockListTournaments.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockListTournaments.mockReturnValue(new Promise(() => {}));
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-loading')).toBeTruthy();
    });
  });

  it('renders screen container during loading', async () => {
    mockListTournaments.mockReturnValue(new Promise(() => {}));
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-screen')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockListTournaments.mockRejectedValue(new Error('Network error'));
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockListTournaments.mockRejectedValue(new Error('Network error'));
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockListTournaments.mockRejectedValueOnce(new Error('fail'));
    mockListTournaments.mockResolvedValue([]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tournaments-retry-btn'));
    await waitFor(() => {
      expect(mockListTournaments).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — empty states', () => {
  it('renders upcoming empty state when no upcoming tournaments', async () => {
    mockListTournaments.mockResolvedValue([]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-upcoming-empty')).toBeTruthy();
    });
  });

  it('renders nearby empty state when no nearby tournaments', async () => {
    mockListTournaments.mockResolvedValue([]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-nearby-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Data rendering
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — data rendering', () => {
  it('renders active tournament card', async () => {
    mockListTournaments.mockResolvedValue([MOCK_ACTIVE_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-active-card-1')).toBeTruthy();
    });
  });

  it('renders upcoming tournament as list card', async () => {
    mockListTournaments.mockResolvedValue([MOCK_UPCOMING_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      // SETUP tournaments appear in both "My Upcoming" and "Nearby" sections
      expect(screen.getAllByTestId('tournament-list-card-2')[0]).toBeTruthy();
    });
  });

  it('renders past tournament as past card', async () => {
    mockListTournaments.mockResolvedValue([MOCK_PAST_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-past-card-3')).toBeTruthy();
    });
  });

  it('renders tournament names', async () => {
    mockListTournaments.mockResolvedValue([MOCK_UPCOMING_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      // SETUP tournament appears in both sections — getAllByText handles duplicates
      expect(screen.getAllByText('Summer Slam')[0]).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — filter chips', () => {
  it('renders All filter chip', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-all')).toBeTruthy();
    });
  });

  it('renders KoB filter chip', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-kob')).toBeTruthy();
    });
  });

  it('renders Bracket filter chip', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-bracket')).toBeTruthy();
    });
  });

  it('renders This Week filter chip', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-this_week')).toBeTruthy();
    });
  });

  it('renders Open Spots filter chip', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-open_spots')).toBeTruthy();
    });
  });

  it('responds to filter chip press without error', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-filter-kob')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tournament-filter-kob'));
    // No error expected — filter state updates client-side
    expect(screen.getByTestId('tournament-filter-kob')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('TournamentsListScreen — navigation', () => {
  it('renders Create New button', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-create-btn')).toBeTruthy();
    });
  });

  it('navigates to tournament create when Create New is pressed', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-create-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tournaments-create-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/tournament/create');
  });

  it('navigates to tournament detail when active card is pressed', async () => {
    mockListTournaments.mockResolvedValue([MOCK_ACTIVE_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-active-card-1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tournament-active-card-1'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/tournament/1');
  });

  it('navigates to tournament detail when list card is pressed', async () => {
    mockListTournaments.mockResolvedValue([MOCK_UPCOMING_TOURNAMENT]);
    render(<TournamentsRoute />);
    await waitFor(() => {
      // SETUP tournaments appear in both sections — use first instance
      expect(screen.getAllByTestId('tournament-list-card-2')[0]).toBeTruthy();
    });
    fireEvent.press(screen.getAllByTestId('tournament-list-card-2')[0]);
    expect(mockPush).toHaveBeenCalledWith('/(stack)/tournament/2');
  });

  it('renders create CTA in the scroll list', async () => {
    render(<TournamentsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournaments-create-cta')).toBeTruthy();
    });
  });
});
