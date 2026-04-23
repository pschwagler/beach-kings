/**
 * Behavior tests for the Court Photos gallery screen.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Error state renders on fetch failure, retry works
 *   - Photo grid renders with correct count
 *   - Empty state when no photos
 *   - "+ Add" button renders in TopNav
 *   - Court info header renders
 *   - Photo count bar renders
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
    useRouter: () => ({ push: mockPush, back: mockBack }),
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
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
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

const mockGetCourtPhotos = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCourtPhotos: (...args: unknown[]) => mockGetCourtPhotos(...args),
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

import CourtPhotosRoute from '../../../../app/(stack)/court/[id]/photos';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PHOTOS = [
  {
    id: 1,
    url: 'https://picsum.photos/seed/p1/400/400',
    caption: 'Morning light',
    created_at: '2026-04-01T09:00:00Z',
  },
  {
    id: 2,
    url: 'https://picsum.photos/seed/p2/400/400',
    caption: null,
    created_at: '2026-04-05T14:00:00Z',
  },
  {
    id: 3,
    url: 'https://picsum.photos/seed/p3/400/400',
    caption: 'Evening game',
    created_at: '2026-04-10T18:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  mockGetCourtPhotos.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetCourtPhotos.mockReturnValue(new Promise(() => {}));
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetCourtPhotos.mockRejectedValue(new Error('Network error'));
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-error')).toBeTruthy();
    });
  });

  it('renders retry button', async () => {
    mockGetCourtPhotos.mockRejectedValue(new Error('Network error'));
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetCourtPhotos.mockRejectedValueOnce(new Error('fail'));
    mockGetCourtPhotos.mockResolvedValue([]);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('court-photos-retry-btn'));
    await waitFor(() => {
      expect(mockGetCourtPhotos).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — empty state', () => {
  it('renders empty state when no photos', async () => {
    mockGetCourtPhotos.mockResolvedValue([]);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-empty')).toBeTruthy();
    });
  });

  it('renders Add Photo CTA in empty state', async () => {
    mockGetCourtPhotos.mockResolvedValue([]);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-first-btn')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Photos grid
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — photos grid', () => {
  it('renders the screen container', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-screen')).toBeTruthy();
    });
  });

  it('renders photo grid when photos are present', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-grid')).toBeTruthy();
    });
  });

  it('renders photo count bar with correct count', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-count-bar')).toBeTruthy();
      expect(screen.getByText('3 photos')).toBeTruthy();
    });
  });

  it('renders singular "photo" when count is 1', async () => {
    mockGetCourtPhotos.mockResolvedValue([MOCK_PHOTOS[0]]);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByText('1 photo')).toBeTruthy();
    });
  });

  it('renders + Add button in header', async () => {
    mockGetCourtPhotos.mockResolvedValue([]);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-btn')).toBeTruthy();
    });
  });

  it('renders court info header', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-header')).toBeTruthy();
    });
  });

  it('renders guidance text', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    render(<CourtPhotosRoute />);
    await waitFor(() => {
      expect(
        screen.getByText(/Add photos that help other players/i),
      ).toBeTruthy();
    });
  });
});
