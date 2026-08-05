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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    bgElevated: '#e8e3d9',
    brandTeal: '#146b72',
  }),
}));

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
const mockGetCourtById = jest.fn();
const mockUploadCourtPhoto = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCourtPhotos: (...args: unknown[]) => mockGetCourtPhotos(...args),
    getCourtById: (...args: unknown[]) => mockGetCourtById(...args),
    uploadCourtPhoto: (...args: unknown[]) => mockUploadCourtPhoto(...args),
  },
}));

const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissionsAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) =>
    mockLaunchImageLibraryAsync(...args),
  MediaTypeOptions: { Images: 'Images' },
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

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CourtPhotosRoute />
    </QueryClientProvider>,
  );
}

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
  mockGetCourtById.mockResolvedValue(null);
  mockUploadCourtPhoto.mockResolvedValue({ id: 99, url: 'https://x' });
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetCourtPhotos.mockReturnValue(new Promise(() => {}));
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-error')).toBeTruthy();
    });
  });

  it('renders retry button', async () => {
    mockGetCourtPhotos.mockRejectedValue(new Error('Network error'));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetCourtPhotos.mockRejectedValueOnce(new Error('fail'));
    mockGetCourtPhotos.mockResolvedValue([]);
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-empty')).toBeTruthy();
    });
  });

  it('renders Add Photo CTA in empty state', async () => {
    mockGetCourtPhotos.mockResolvedValue([]);
    renderScreen();
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-screen')).toBeTruthy();
    });
  });

  it('renders photo grid when photos are present', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-grid')).toBeTruthy();
    });
  });

  it('renders photo count bar with correct count', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-count-bar')).toBeTruthy();
      expect(screen.getByText('3 photos')).toBeTruthy();
    });
  });

  it('renders singular "photo" when count is 1', async () => {
    mockGetCourtPhotos.mockResolvedValue([MOCK_PHOTOS[0]]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('1 photo')).toBeTruthy();
    });
  });

  it('renders + Add button in header', async () => {
    mockGetCourtPhotos.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-btn')).toBeTruthy();
    });
  });

  it('renders court info header', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-header')).toBeTruthy();
    });
  });

  it('renders guidance text', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    renderScreen();
    await waitFor(() => {
      expect(
        screen.getByText(/Add photos that help other players/i),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------

describe('CourtPhotosScreen — upload flow', () => {
  it('uploads a picked photo and refetches the list', async () => {
    mockGetCourtPhotos.mockResolvedValueOnce(MOCK_PHOTOS);
    mockGetCourtById.mockResolvedValue({ id: 1, name: 'Court A' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/photo.jpg',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    mockUploadCourtPhoto.mockResolvedValue({ id: 4, url: 'https://x' });
    mockGetCourtPhotos.mockResolvedValueOnce([
      ...MOCK_PHOTOS,
      { id: 4, url: 'https://x', caption: null, created_at: null },
    ]);

    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('court-photos-add-btn'));

    await waitFor(() => {
      expect(mockUploadCourtPhoto).toHaveBeenCalledTimes(1);
    });
    expect(mockUploadCourtPhoto.mock.calls[0][0]).toBe(1);
    expect(mockUploadCourtPhoto.mock.calls[0][1]).toMatchObject({
      uri: 'file:///tmp/photo.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
  });

  it('does not upload when user cancels the picker', async () => {
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('court-photos-add-btn'));

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
    });
    expect(mockUploadCourtPhoto).not.toHaveBeenCalled();
  });

  it('launches the picker without requesting media-library permission', async () => {
    // The system photo picker (iOS PHPicker / Android Photo Picker) runs
    // out-of-process and needs no media-library permission, so the hook must
    // not gate on requestMediaLibraryPermissionsAsync — gating there blocks
    // "Limited Access" users and offers no benefit for a pick-only flow.
    mockGetCourtPhotos.mockResolvedValue(MOCK_PHOTOS);
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });

    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('court-photos-add-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('court-photos-add-btn'));

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
    });
    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });
});
