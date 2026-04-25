/**
 * Behavior tests for the My Stats screen.
 *
 * Covers:
 *   - Loading skeleton while fetching
 *   - Error state on failure, retry works
 *   - Profile header renders name, city, level
 *   - Stats bar renders key numbers
 *   - Trophy row renders when trophies present
 *   - Time chip filter changes trigger refetch
 *   - Stats grid renders stat cards
 *   - Rating chart renders when timeline has 2+ points
 *   - Breakdown table and toggle render
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
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
  const Polygon = () => null;
  const Polyline = () => null;
  const Defs = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const LinearGradient = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Stop = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
    Polygon,
    Polyline,
    Defs,
    LinearGradient,
    Stop,
  };
});

const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

const mockGetMyStats = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getMyStats: (...args: unknown[]) => mockGetMyStats(...args),
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

import MyStatsScreen from '../../../../app/(stack)/my-stats';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_STATS = {
  player_name: 'Patrick Schwagler',
  player_city: 'New York, NY',
  player_level: 'Open',
  overall: {
    wins: 66,
    losses: 28,
    games_played: 94,
    rating: 1438,
    peak_rating: 1462,
    win_rate: 70.2,
    current_streak: 9,
    avg_point_diff: 2.7,
  },
  trophies: [
    {
      league_id: 1,
      league_name: 'QBK Open Men',
      season_name: 'Season 3',
      place: 2,
    },
  ],
  partners: [
    {
      player_id: 10,
      display_name: 'C. Gulla',
      initials: 'CG',
      games_played: 34,
      wins: 28,
      losses: 6,
      win_rate: 82,
    },
  ],
  opponents: [
    {
      player_id: 20,
      display_name: 'J. Drabos',
      initials: 'JD',
      games_played: 12,
      wins: 7,
      losses: 5,
      win_rate: 58,
    },
  ],
  elo_timeline: [
    { date: '2026-01-01', rating: 1400 },
    { date: '2026-03-19', rating: 1438 },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyStats.mockResolvedValue(MOCK_STATS);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('MyStatsScreen — loading state', () => {
  it('renders stats loading skeleton while data is fetching', async () => {
    mockGetMyStats.mockReturnValue(new Promise(() => {}));
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('MyStatsScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetMyStats.mockRejectedValue(new Error('Network error'));
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetMyStats.mockRejectedValue(new Error('Network error'));
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetMyStats.mockRejectedValueOnce(new Error('fail'));
    mockGetMyStats.mockResolvedValue(MOCK_STATS);
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-retry-btn'));
    await waitFor(() => {
      expect(mockGetMyStats).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Profile header
// ---------------------------------------------------------------------------

describe('MyStatsScreen — profile header', () => {
  it('renders player name', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Patrick Schwagler')).toBeTruthy();
    });
  });

  it('renders player city', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByText('New York, NY')).toBeTruthy();
    });
  });

  it('renders player level badge', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Open')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

describe('MyStatsScreen — stats bar', () => {
  it('renders games played count', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      // Value may appear in both the stats bar and the stats grid
      expect(screen.getAllByText('94').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders current rating', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      // Value may appear in both the stats bar and the stats grid
      expect(screen.getAllByText('1438').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders win-loss record', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      // Value may appear in both the stats bar and the stats grid
      expect(screen.getAllByText('66-28').length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Trophy row
// ---------------------------------------------------------------------------

describe('MyStatsScreen — trophies', () => {
  it('renders trophy row when trophies are present', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('trophy-row')).toBeTruthy();
    });
  });

  it('does not render trophy row when no trophies', async () => {
    mockGetMyStats.mockResolvedValue({ ...MOCK_STATS, trophies: [] });
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.queryByTestId('trophy-row')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Time filter chips
// ---------------------------------------------------------------------------

describe('MyStatsScreen — time chips', () => {
  it('renders time filter chips', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('time-chip-all')).toBeTruthy();
      expect(screen.getByTestId('time-chip-30d')).toBeTruthy();
      expect(screen.getByTestId('time-chip-90d')).toBeTruthy();
      expect(screen.getByTestId('time-chip-1y')).toBeTruthy();
    });
  });

  it('triggers a stats refetch when a time chip is pressed', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('time-chip-30d')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('time-chip-30d'));
    await waitFor(() => {
      expect(mockGetMyStats).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Stats grid
// ---------------------------------------------------------------------------

describe('MyStatsScreen — stats grid', () => {
  it('renders the stats grid', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-grid')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Rating chart
// ---------------------------------------------------------------------------

describe('MyStatsScreen — rating chart', () => {
  it('renders the rating chart when elo_timeline has 2+ points', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('rating-chart')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Breakdown table
// ---------------------------------------------------------------------------

describe('MyStatsScreen — breakdown table', () => {
  it('renders the breakdown table', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('breakdown-table')).toBeTruthy();
    });
  });

  it('renders partner rows by default', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByText('C. Gulla')).toBeTruthy();
    });
  });

  it('switches to opponents tab when Opponents toggle is pressed', async () => {
    render(<MyStatsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-opponents')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('toggle-opponents'));
    await waitFor(() => {
      expect(screen.getByText('J. Drabos')).toBeTruthy();
    });
  });
});
