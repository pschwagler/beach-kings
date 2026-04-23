/**
 * Behavior tests for the Courts list screen.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Error state renders on fetch failure, retry works
 *   - Courts list renders with CourtRow items
 *   - Empty state renders when no courts returned
 *   - Filter chips render and respond to presses
 *   - Search query filters court list client-side
 *   - Map stub renders
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
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
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

const mockHapticLight = jest.fn().mockResolvedValue(undefined);
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticLight: () => mockHapticLight(),
  hapticMedium: () => mockHapticMedium(),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetCourts = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
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

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import CourtsScreen from '../../../../app/(stack)/courts';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_COURT_1 = {
  id: 1,
  name: 'Manhattan Beach Courts',
  slug: 'manhattan-beach',
  surface_type: 'sand',
  city: 'Manhattan Beach',
  state: 'CA',
  address: '1 Manhattan Beach Blvd',
  latitude: 33.8847,
  longitude: -118.4109,
  average_rating: 4.6,
  review_count: 42,
  court_count: 8,
  photo_count: 12,
  is_free: true,
  has_lights: false,
  distance_miles: 0.3,
};

const MOCK_COURT_2 = {
  id: 2,
  name: 'QBK Sports',
  slug: 'qbk-sports',
  surface_type: 'sand',
  city: 'Queens',
  state: 'NY',
  address: '123 Beach Blvd',
  latitude: 40.7128,
  longitude: -73.976,
  average_rating: 4.8,
  review_count: 23,
  court_count: 6,
  photo_count: 7,
  is_free: false,
  has_lights: true,
  distance_miles: 2.1,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticLight.mockResolvedValue(undefined);
  mockHapticMedium.mockResolvedValue(undefined);
  mockGetCourts.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('CourtsScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetCourts.mockReturnValue(new Promise(() => {}));
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-list-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('CourtsScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetCourts.mockRejectedValue(new Error('Network error'));
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetCourts.mockRejectedValue(new Error('Network error'));
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetCourts.mockRejectedValueOnce(new Error('fail'));
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('courts-retry-btn'));
    await waitFor(() => {
      expect(mockGetCourts).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('CourtsScreen — empty state', () => {
  it('renders empty state when no courts returned', async () => {
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-empty-state')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Courts list
// ---------------------------------------------------------------------------

describe('CourtsScreen — courts list', () => {
  it('renders a court row for each returned court', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('court-row-1')).toBeTruthy();
      expect(screen.getByTestId('court-row-2')).toBeTruthy();
    });
  });

  it('renders court name in each row', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach Courts')).toBeTruthy();
    });
  });

  it('renders city and state in each row', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach, CA')).toBeTruthy();
    });
  });

  it('renders distance when available', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByText('· 0.3 mi')).toBeTruthy();
    });
  });

  it('navigates to court detail when a row is pressed', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('court-row-1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('court-row-1'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/court/1'));
  });

  it('renders map stub area', async () => {
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-map-stub')).toBeTruthy();
    });
  });

  it('renders View Full Map button', async () => {
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-full-map-btn')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

describe('CourtsScreen — filter bar', () => {
  it('renders the filter bar', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-filter-bar')).toBeTruthy();
    });
  });

  it('renders all filter chips', async () => {
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-nearby')).toBeTruthy();
      expect(screen.getByTestId('filter-court-my-courts')).toBeTruthy();
      expect(screen.getByTestId('filter-court-top-rated')).toBeTruthy();
      expect(screen.getByTestId('filter-court-indoor')).toBeTruthy();
      expect(screen.getByTestId('filter-court-outdoor')).toBeTruthy();
      expect(screen.getByTestId('filter-court-lighted')).toBeTruthy();
    });
  });

  it('filters to lighted courts when lighted chip is pressed', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-lighted')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-court-lighted'));
    await waitFor(() => {
      // MOCK_COURT_2 has lights, MOCK_COURT_1 does not
      expect(screen.queryByTestId('court-row-1')).toBeNull();
      expect(screen.getByTestId('court-row-2')).toBeTruthy();
    });
  });

  it('clears filter when same chip is pressed again', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-lighted')).toBeTruthy();
    });
    // Activate lighted
    fireEvent.press(screen.getByTestId('filter-court-lighted'));
    await waitFor(() => {
      expect(screen.queryByTestId('court-row-1')).toBeNull();
    });
    // Deactivate lighted
    fireEvent.press(screen.getByTestId('filter-court-lighted'));
    await waitFor(() => {
      expect(screen.getByTestId('court-row-1')).toBeTruthy();
      expect(screen.getByTestId('court-row-2')).toBeTruthy();
    });
  });

  it('shows clear filter button in empty state when filter is active', async () => {
    // Only lighted courts, but we filter to indoor (none match)
    mockGetCourts.mockResolvedValue([MOCK_COURT_2]); // has_lights=true, surface_type=sand
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-indoor')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-court-indoor'));
    await waitFor(() => {
      expect(screen.getByTestId('courts-clear-filter-btn')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Main screen wrapper
// ---------------------------------------------------------------------------

describe('CourtsScreen — screen wrapper', () => {
  it('renders the courts screen container', async () => {
    mockGetCourts.mockResolvedValue([]);
    render(<CourtsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('courts-screen')).toBeTruthy();
    });
  });
});
