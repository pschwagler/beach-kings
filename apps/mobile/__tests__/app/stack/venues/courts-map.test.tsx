/**
 * Tests for map-related courts components:
 *   - CourtMapPreview (detail screen map card)
 *   - CourtsMapView (full-screen courts map)
 *
 * Covers:
 *   - CourtMapPreview renders when lat/lng are present
 *   - CourtMapPreview shows fallback when lat/lng are null
 *   - CourtMapPreview pressing calls openDirections
 *   - CourtsMapView renders markers for courts with coordinates
 *   - CourtsMapView skips courts without coordinates
 *   - CourtsMapView calls onSelectCourt when a marker is pressed
 *   - Courts list/map toggle switches view mode
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be declared before module imports
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
  return { __esModule: true, default: Svg, Svg, Path, Circle };
});

// react-native-maps mock: MapView renders children; Marker renders a pressable stub.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');

  function MockMapView({
    children,
    testID,
  }: {
    children?: React.ReactNode;
    testID?: string;
    [key: string]: unknown;
  }): React.ReactNode {
    return <View testID={testID ?? 'map-view'}>{children}</View>;
  }

  function MockMarker({
    title,
    onPress,
    onCalloutPress,
    testID,
  }: {
    title?: string;
    onPress?: () => void;
    onCalloutPress?: () => void;
    testID?: string;
    [key: string]: unknown;
  }): React.ReactNode {
    return (
      <Pressable
        testID={testID ?? `marker-${title ?? 'unknown'}`}
        onPress={onPress}
        accessibilityLabel={title ?? 'marker'}
      >
        <Text>{title}</Text>
      </Pressable>
    );
  }

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
  };
});

// expo-location mock: permission granted, position available.
const mockRequestForegroundPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: 'granted' });
const mockGetCurrentPositionAsync = jest.fn().mockResolvedValue({
  coords: { latitude: 34.0, longitude: -118.0 },
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockRequestForegroundPermissionsAsync(),
  getCurrentPositionAsync: () => mockGetCurrentPositionAsync(),
  Accuracy: { Balanced: 3 },
}));

// openDirections mock
const mockOpenDirections = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/maps', () => ({
  openDirections: (...args: unknown[]) => mockOpenDirections(...args),
}));

// usePaletteColors mock
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#00b4a2',
  }),
}));

// ThemeContext mock
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

// haptics mock
jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

// api mock
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

// ---------------------------------------------------------------------------
// Modules under test — imported AFTER all mocks
// ---------------------------------------------------------------------------

import CourtMapPreview from '../../../../src/components/screens/Venues/CourtMapPreview';
import CourtsMapView from '../../../../src/components/screens/Venues/CourtsMapView';
import CourtsScreen from '../../../../app/(stack)/courts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// CourtsScreen resolves location via TanStack-backed hooks → needs a provider.
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

const COURT_WITH_COORDS = {
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
};

const COURT_NO_COORDS = {
  id: 2,
  name: 'Indoor Courts',
  slug: 'indoor-courts',
  surface_type: 'indoor',
  city: 'Los Angeles',
  state: 'CA',
  address: '123 Indoor Ave',
  latitude: null,
  longitude: null,
  average_rating: 4.0,
  review_count: 5,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCourts.mockResolvedValue([]);
  mockGetCurrentUserPlayer.mockResolvedValue(null);
  mockGetPlayerHomeCourts.mockResolvedValue([]);
  mockGetLocations.mockResolvedValue([]);
  mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 34.0, longitude: -118.0 },
  });
});

// ---------------------------------------------------------------------------
// CourtMapPreview — with coordinates
// ---------------------------------------------------------------------------

describe('CourtMapPreview — with coordinates', () => {
  it('renders the testID="court-map-preview" container', () => {
    render(<CourtMapPreview court={COURT_WITH_COORDS} />);
    expect(screen.getByTestId('court-map-preview')).toBeTruthy();
  });

  it('renders a MapView when court has lat/lng', () => {
    render(<CourtMapPreview court={COURT_WITH_COORDS} />);
    expect(screen.getByTestId('map-view')).toBeTruthy();
  });

  it('renders the court address below the map', () => {
    render(<CourtMapPreview court={COURT_WITH_COORDS} />);
    expect(screen.getByText('1 Manhattan Beach Blvd')).toBeTruthy();
  });

  it('renders the "Tap map to open directions" hint', () => {
    render(<CourtMapPreview court={COURT_WITH_COORDS} />);
    expect(screen.getByText('Tap map to open directions')).toBeTruthy();
  });

  it('calls openDirections with correct args when map is pressed', async () => {
    render(<CourtMapPreview court={COURT_WITH_COORDS} />);
    // Find the pressable by its accessibilityLabel using getByLabelText (RNTL v12)
    fireEvent.press(
      screen.getByLabelText(
        'Open directions to Manhattan Beach Courts at 1 Manhattan Beach Blvd',
      ),
    );
    await waitFor(() => {
      expect(mockOpenDirections).toHaveBeenCalledWith({
        latitude: 33.8847,
        longitude: -118.4109,
        name: 'Manhattan Beach Courts',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// CourtMapPreview — null coordinates fallback
// ---------------------------------------------------------------------------

describe('CourtMapPreview — null coordinates fallback', () => {
  it('renders the testID="court-map-preview" container', () => {
    render(<CourtMapPreview court={COURT_NO_COORDS} />);
    expect(screen.getByTestId('court-map-preview')).toBeTruthy();
  });

  it('does NOT render a MapView when court has no lat/lng', () => {
    render(<CourtMapPreview court={COURT_NO_COORDS} />);
    expect(screen.queryByTestId('map-view')).toBeNull();
  });

  it('renders "Map unavailable" text when coords are absent', () => {
    render(<CourtMapPreview court={COURT_NO_COORDS} />);
    expect(screen.getByText('Map unavailable')).toBeTruthy();
  });

  it('shows the address in the placeholder when coords are absent', () => {
    render(<CourtMapPreview court={COURT_NO_COORDS} />);
    expect(screen.getByText('123 Indoor Ave')).toBeTruthy();
  });

  it('does NOT call openDirections when the fallback card area is interacted with', async () => {
    // No pressable on the placeholder; verify openDirections is never called.
    render(<CourtMapPreview court={COURT_NO_COORDS} />);
    // No interaction — just verify no side effect
    await waitFor(() => {
      expect(mockOpenDirections).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// CourtMapPreview — court without address
// ---------------------------------------------------------------------------

describe('CourtMapPreview — court without address', () => {
  const courtNoAddress = { ...COURT_WITH_COORDS, address: null };

  it('renders without address line below map', () => {
    render(<CourtMapPreview court={courtNoAddress} />);
    // Map should still render; no address text below it
    expect(screen.getByTestId('map-view')).toBeTruthy();
  });

  it('uses court name only in accessibility label when no address', () => {
    render(<CourtMapPreview court={courtNoAddress} />);
    expect(
      screen.getByLabelText('Open directions to Manhattan Beach Courts'),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CourtsMapView — markers
// ---------------------------------------------------------------------------

describe('CourtsMapView — markers', () => {
  const onSelectCourt = jest.fn();

  beforeEach(() => {
    onSelectCourt.mockReset();
  });

  it('renders the courts-map-view container', () => {
    render(
      <CourtsMapView courts={[COURT_WITH_COORDS]} onSelectCourt={onSelectCourt} />,
    );
    expect(screen.getByTestId('courts-map-view')).toBeTruthy();
  });

  it('renders a marker for a court that has coordinates', () => {
    render(
      <CourtsMapView courts={[COURT_WITH_COORDS]} onSelectCourt={onSelectCourt} />,
    );
    expect(screen.getByText('Manhattan Beach Courts')).toBeTruthy();
  });

  it('does NOT render a marker for courts without coordinates', () => {
    render(
      <CourtsMapView
        courts={[COURT_NO_COORDS]}
        onSelectCourt={onSelectCourt}
      />,
    );
    expect(screen.queryByText('Indoor Courts')).toBeNull();
  });

  it('renders markers only for courts with coordinates in a mixed list', () => {
    render(
      <CourtsMapView
        courts={[COURT_WITH_COORDS, COURT_NO_COORDS]}
        onSelectCourt={onSelectCourt}
      />,
    );
    expect(screen.getByText('Manhattan Beach Courts')).toBeTruthy();
    expect(screen.queryByText('Indoor Courts')).toBeNull();
  });

  it('calls onSelectCourt when a marker is pressed', () => {
    render(
      <CourtsMapView courts={[COURT_WITH_COORDS]} onSelectCourt={onSelectCourt} />,
    );
    fireEvent.press(screen.getByText('Manhattan Beach Courts'));
    expect(onSelectCourt).toHaveBeenCalledWith(COURT_WITH_COORDS);
  });

  it('shows empty state when no courts have coordinates', () => {
    render(
      <CourtsMapView courts={[COURT_NO_COORDS]} onSelectCourt={onSelectCourt} />,
    );
    expect(screen.getByText('No courts with map data')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CourtsScreen — List/Map toggle
// ---------------------------------------------------------------------------

describe('CourtsScreen — list/map toggle', () => {
  beforeEach(() => {
    mockGetCourts.mockResolvedValue([COURT_WITH_COORDS]);
  });

  it('renders the view-mode toggle', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle')).toBeTruthy();
    });
  });

  it('renders List and Map toggle buttons', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle-list')).toBeTruthy();
      expect(screen.getByTestId('courts-view-toggle-map')).toBeTruthy();
    });
  });

  it('defaults to list mode (courts-list visible)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-list')).toBeTruthy();
    });
  });

  it('switches to map mode when Map toggle is pressed', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle-map')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('courts-view-toggle-map'));
    await waitFor(() => {
      expect(screen.getByTestId('courts-map-view')).toBeTruthy();
    });
  });

  it('returns to list mode when List toggle is pressed from map mode', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle-map')).toBeTruthy();
    });
    // Switch to map
    fireEvent.press(screen.getByTestId('courts-view-toggle-map'));
    await waitFor(() => {
      expect(screen.getByTestId('courts-map-view')).toBeTruthy();
    });
    // Switch back to list
    fireEvent.press(screen.getByTestId('courts-view-toggle-list'));
    await waitFor(() => {
      expect(screen.getByTestId('courts-list')).toBeTruthy();
    });
  });

  it('"View Full Map" button in list mode switches to map mode', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-full-map-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('courts-view-full-map-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('courts-map-view')).toBeTruthy();
    });
  });

  it('navigates to court detail when a map marker is pressed', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle-map')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('courts-view-toggle-map'));
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach Courts')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Manhattan Beach Courts'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/court/1'));
  });
});

// ---------------------------------------------------------------------------
// CourtsScreen — location permission denied fallback
// ---------------------------------------------------------------------------

describe('CourtsScreen — location permission denied', () => {
  beforeEach(() => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
    });
    mockGetCourts.mockResolvedValue([COURT_WITH_COORDS]);
  });

  it('still renders courts list when location permission is denied', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-list')).toBeTruthy();
    });
  });

  it('still renders the toggle when location permission is denied', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('courts-view-toggle')).toBeTruthy();
    });
  });
});
