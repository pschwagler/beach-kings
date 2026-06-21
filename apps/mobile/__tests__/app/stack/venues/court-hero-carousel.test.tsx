/**
 * Unit tests for CourtHeroCarousel.
 *
 * Covers:
 *   - Multiple photos: all slides render, dot count matches, court-hero-image present
 *   - Single photo: one slide renders, no dots shown, court-hero-image present
 *   - No photos: picsum placeholder slide renders, court-hero-image present
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks (mirror court-detail.test.tsx pattern)
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: '1' }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => (
      <View testID="slot">{children}</View>
    ),
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

// ThemeContext: needed by usePaletteColors.
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

// usePaletteColors: return minimal palette.
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#00b4a2' }),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import CourtHeroCarousel from '../../../../src/components/screens/Venues/CourtHeroCarousel';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function makePhoto(id: number) {
  return {
    id,
    url: `https://picsum.photos/seed/ct${id}/800/600`,
    created_at: '2026-04-01T09:00:00Z',
  };
}

const BASE_COURT = {
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
  is_free: true,
  has_lights: false,
  is_active: true,
};

// ---------------------------------------------------------------------------
// Tests: multiple photos
// ---------------------------------------------------------------------------

describe('CourtHeroCarousel — multiple photos', () => {
  const photos = [makePhoto(1), makePhoto(2), makePhoto(3)];
  const court = { ...BASE_COURT, photo_count: 3, court_photos: photos, all_photos: [] };

  it('renders court-hero-image testID', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByTestId('court-hero-image')).toBeTruthy();
  });

  it('renders a slide for each photo', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-slide').length).toBe(3);
  });

  it('renders one dot indicator per photo', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-dot').length).toBe(3);
  });

  it('renders the photo count badge', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByTestId('photo-count-badge')).toBeTruthy();
  });

  it('shows correct photo count text', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByText('3 photos')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: single photo
// ---------------------------------------------------------------------------

describe('CourtHeroCarousel — single photo', () => {
  const photos = [makePhoto(1)];
  const court = { ...BASE_COURT, photo_count: 1, court_photos: photos, all_photos: [] };

  it('renders court-hero-image testID', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByTestId('court-hero-image')).toBeTruthy();
  });

  it('renders exactly one slide', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-slide').length).toBe(1);
  });

  it('does not render dot indicators for a single photo', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.queryAllByTestId('carousel-dot').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: no photos (empty arrays)
// ---------------------------------------------------------------------------

describe('CourtHeroCarousel — no photos', () => {
  const court = {
    ...BASE_COURT,
    photo_count: 0,
    court_photos: [],
    all_photos: [],
  };

  it('renders court-hero-image testID', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByTestId('court-hero-image')).toBeTruthy();
  });

  it('renders exactly one slide (picsum placeholder)', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-slide').length).toBe(1);
  });

  it('does not render dot indicators when no photos', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.queryAllByTestId('carousel-dot').length).toBe(0);
  });

  it('does not render photo count badge when photo_count is 0', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.queryByTestId('photo-count-badge')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: undefined court_photos (falls back to all_photos)
// ---------------------------------------------------------------------------

describe('CourtHeroCarousel — falls back to all_photos', () => {
  const photos = [makePhoto(10), makePhoto(11)];
  const court = {
    ...BASE_COURT,
    photo_count: 2,
    court_photos: undefined,
    all_photos: photos,
  };

  it('renders court-hero-image testID', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getByTestId('court-hero-image')).toBeTruthy();
  });

  it('renders a slide for each all_photos item', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-slide').length).toBe(2);
  });

  it('renders dot indicators for all_photos', () => {
    render(<CourtHeroCarousel court={court} />);
    expect(screen.getAllByTestId('carousel-dot').length).toBe(2);
  });
});
