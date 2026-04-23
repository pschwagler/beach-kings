/**
 * Behavior tests for the Court Detail screen.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Error state renders on fetch failure, retry works
 *   - Court header renders (name, city, badges)
 *   - Rating bar renders
 *   - Action row: Check In + Add to My Courts buttons
 *   - Court Info section renders
 *   - Photos section renders
 *   - Reviews section renders
 *   - "See All" photos navigates to gallery
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
    useLocalSearchParams: () => ({ id: '1' }),
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

const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetCourtById = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCourtById: (...args: unknown[]) => mockGetCourtById(...args),
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

import CourtDetailRoute from '../../../../app/(stack)/court/[id]';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_COURT = {
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
  has_restrooms: true,
  has_parking: true,
  nets_provided: false,
  hours: 'Dawn to dusk',
  description: 'Iconic South Bay destination.',
  is_active: true,
  court_photos: [
    {
      id: 1,
      url: 'https://picsum.photos/seed/ct1/800/600',
      created_at: '2026-04-01T09:00:00Z',
    },
    {
      id: 2,
      url: 'https://picsum.photos/seed/ct2/800/600',
      created_at: '2026-04-05T14:00:00Z',
    },
  ],
  all_photos: [],
};

const MOCK_COURT_VENICE = {
  id: 2,
  name: 'Venice Beach Courts',
  slug: 'venice-beach',
  surface_type: 'sand',
  city: 'Venice',
  state: 'CA',
  address: '1800 Ocean Front Walk',
  latitude: 33.985,
  longitude: -118.472,
  average_rating: 4.2,
  review_count: 18,
  court_count: 6,
  photo_count: 0,
  is_free: true,
  has_lights: false,
  has_restrooms: false,
  has_parking: false,
  nets_provided: true,
  hours: 'Sunrise to sunset',
  description: 'Classic Venice Beach volleyball courts.',
  is_active: true,
  court_photos: [],
  all_photos: [],
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  mockGetCourtById.mockResolvedValue(MOCK_COURT);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('CourtDetailScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetCourtById.mockReturnValue(new Promise(() => {}));
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-detail-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('CourtDetailScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetCourtById.mockRejectedValue(new Error('Network error'));
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-detail-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetCourtById.mockRejectedValue(new Error('Network error'));
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-detail-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetCourtById.mockRejectedValueOnce(new Error('fail'));
    mockGetCourtById.mockResolvedValue(MOCK_COURT);
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-detail-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('court-detail-retry-btn'));
    await waitFor(() => {
      expect(mockGetCourtById).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Court content
// ---------------------------------------------------------------------------

describe('CourtDetailScreen — court content', () => {
  it('renders the court detail screen container', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-detail-screen')).toBeTruthy();
    });
  });

  it('renders court name in header', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      // Court name appears in both TopNav title and the content header
      const elements = screen.getAllByText('Manhattan Beach Courts');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders court city and state', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach, CA')).toBeTruthy();
    });
  });

  it('renders Outdoor badge for sand courts', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('Outdoor')).toBeTruthy();
    });
  });

  it('renders Free Play badge for free courts', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('Free Play')).toBeTruthy();
    });
  });

  it('renders rating bar with rating and review count', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-rating-bar')).toBeTruthy();
    });
  });

  it('renders check-in button', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('check-in-btn-1')).toBeTruthy();
    });
  });

  it('renders add-to-my-courts button', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('add-court-btn-1')).toBeTruthy();
    });
  });

  it('renders court info section', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-info-section')).toBeTruthy();
    });
  });

  it('renders court map preview', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-map-preview')).toBeTruthy();
    });
  });

  it('renders photos section', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-section')).toBeTruthy();
    });
  });

  it('renders see all photos button', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-see-all-photos-btn')).toBeTruthy();
    });
  });

  it('navigates to court photos when See All is pressed', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-see-all-photos-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('court-see-all-photos-btn'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/court/1/photos'),
    );
  });

  it('renders reviews section', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-reviews-section')).toBeTruthy();
    });
  });

  it('renders hero image area', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-hero-image')).toBeTruthy();
    });
  });

  it('renders hours in court info', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('Dawn to dusk')).toBeTruthy();
    });
  });

  it('renders court address', async () => {
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('1 Manhattan Beach Blvd')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Court without photos
// ---------------------------------------------------------------------------

describe('CourtDetailScreen — court without photos', () => {
  it('renders add photo placeholder when court has no photos', async () => {
    const courtNoPhotos = {
      ...MOCK_COURT,
      photo_count: 0,
      court_photos: [],
    };
    mockGetCourtById.mockResolvedValue(courtNoPhotos);
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-add-photo-placeholder')).toBeTruthy();
    });
  });

  it('renders more photos tile when photo_count exceeds visible', async () => {
    const courtManyPhotos = {
      ...MOCK_COURT,
      photo_count: 10,
      court_photos: [
        { id: 1, url: 'https://picsum.photos/1', caption: null, created_at: '2026-01-01' },
        { id: 2, url: 'https://picsum.photos/2', caption: null, created_at: '2026-01-01' },
        { id: 3, url: 'https://picsum.photos/3', caption: null, created_at: '2026-01-01' },
      ],
    };
    mockGetCourtById.mockResolvedValue(courtManyPhotos);
    render(<CourtDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-more-photos-btn')).toBeTruthy();
    });
  });
});
