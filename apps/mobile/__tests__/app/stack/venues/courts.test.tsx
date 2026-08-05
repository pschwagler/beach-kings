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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

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
const mockGetCurrentUserPlayer = jest.fn();
const mockGetPlayerHomeCourts = jest.fn();
const mockGetLocations = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
    getLocations: (...args: unknown[]) => mockGetLocations(...args),
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

// expo-location: deny permission so location side-effects don't interfere
// with existing list-focused tests. Permits testing the list path cleanly.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 34.0, longitude: -118.0 },
  }),
  Accuracy: { Balanced: 3 },
}));

// react-native-maps: lightweight stubs so importing CourtsMapView doesn't break.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  function MockMapView({ children }: { children?: React.ReactNode; [k: string]: unknown }) {
    return <View testID="map-view">{children}</View>;
  }
  function MockMarker({ title, onPress }: { title?: string; onPress?: () => void; [k: string]: unknown }) {
    return (
      <Pressable testID={`marker-${title ?? 'unknown'}`} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    );
  }
  return { __esModule: true, default: MockMapView, Marker: MockMarker };
});

// usePaletteColors: return minimal palette so CourtsMapView / CourtMapPreview
// can read brandTeal without ThemeContext wiring.
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#00b4a2' }),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import CourtsScreen from '../../../../app/(stack)/courts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// CourtsScreen now resolves the user's location via TanStack-backed hooks, so
// it must render inside a QueryClientProvider.
function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CourtsScreen />
    </QueryClientProvider>,
  );
}

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
  // No player/profile location by default → resolver yields null coords and the
  // list falls back to the unsorted (no-coords) path, matching prior behavior.
  mockGetCurrentUserPlayer.mockResolvedValue(null);
  mockGetPlayerHomeCourts.mockResolvedValue([]);
  mockGetLocations.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('CourtsScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetCourts.mockReturnValue(new Promise(() => {}));
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetCourts.mockRejectedValue(new Error('Network error'));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetCourts.mockRejectedValueOnce(new Error('fail'));
    mockGetCourts.mockResolvedValue([]);
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-empty-state')).toBeTruthy();
    });
  });

  it('does not mislabel an empty catalog as a location-permission problem', async () => {
    mockGetCourts.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('No courts yet')).toBeTruthy());
    expect(screen.queryByText('Enable Location')).toBeNull();
  });

  it('offers search recovery before filter recovery', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    const search = await screen.findByPlaceholderText('Search courts');
    fireEvent.changeText(search, 'nowhere');
    await waitFor(() => expect(screen.getByTestId('courts-clear-search-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('courts-clear-search-btn'));
    await waitFor(() => expect(screen.getByTestId('court-row-1')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Courts list
// ---------------------------------------------------------------------------

describe('CourtsScreen — courts list', () => {
  it('renders a court row for each returned court', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-row-1')).toBeTruthy();
      expect(screen.getByTestId('court-row-2')).toBeTruthy();
    });
  });

  it('renders court name in each row', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    // The name also appears as a map-preview marker, so scope to the row.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('court-row-1')).getByText('Manhattan Beach Courts'),
      ).toBeTruthy();
    });
  });

  it('renders city and state in each row', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach, CA')).toBeTruthy();
    });
  });

  it('renders distance when available', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('· 0.3 mi')).toBeTruthy();
    });
  });

  it('navigates to court detail when a row is pressed', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-row-1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('court-row-1'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/court/1'));
  });

  it('keeps list mode results-first without a map preview', async () => {
    mockGetCourts.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-list')).toBeTruthy();
    });
    expect(screen.queryByTestId('courts-map-stub')).toBeNull();
    expect(screen.queryByTestId('courts-view-full-map-btn')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

describe('CourtsScreen — filter bar', () => {
  it('renders the filter bar', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-filter-bar')).toBeTruthy();
    });
  });

  it('keeps filters visible and selected in map mode', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    renderScreen();
    await screen.findByTestId('filter-court-lighted');
    fireEvent.press(screen.getByTestId('filter-court-lighted'));
    fireEvent.press(screen.getByTestId('courts-view-toggle-map'));
    await waitFor(() => expect(screen.getByTestId('courts-map-view')).toBeTruthy());
    expect(screen.getByTestId('courts-filter-bar')).toBeTruthy();
    expect(screen.getByTestId('filter-court-lighted')).toHaveAccessibilityState({ selected: true });
  });

  it('renders all filter chips', async () => {
    mockGetCourts.mockResolvedValue([]);
    renderScreen();
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
    renderScreen();
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

  it('updates the section heading for My Courts', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-my-courts')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('filter-court-my-courts'));

    await waitFor(() =>
      expect(screen.getByTestId('courts-section-label')).toHaveTextContent(
        'My Courts',
      ),
    );
  });

  it('uses a saved-courts empty state for My Courts', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('filter-court-my-courts')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('filter-court-my-courts'));

    await waitFor(() => expect(screen.getByText('No Saved Courts')).toBeTruthy());
    expect(
      screen.getByText('Save a court from its details page and it will appear here.'),
    ).toBeTruthy();
  });

  it('clears filter when same chip is pressed again', async () => {
    mockGetCourts.mockResolvedValue([MOCK_COURT_1, MOCK_COURT_2]);
    renderScreen();
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
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-screen')).toBeTruthy();
    });
  });
});
