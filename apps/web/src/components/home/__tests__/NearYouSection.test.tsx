/**
 * NearYouSection — unit tests.
 *
 * Primary regression: the component must read player ratings from the flat
 * snake_case field `player.current_rating` (not `player.stats?.current_rating`).
 * The fix changed:
 *   Math.round(player.stats?.current_rating || 1200)
 * to:
 *   Math.round(player.current_rating || 1200)
 *
 * These tests verify that:
 * 1. A player with a flat `current_rating` shows the correct rounded value.
 * 2. A player missing `current_rating` falls back to 1200.
 * 3. A player whose rating was previously nested under `stats` is NOT used
 *    (i.e. a player with stats.current_rating but no top-level current_rating
 *    still shows 1200).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that trigger the modules
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('../../../services/api', () => ({
  getPublicCourts: vi.fn(),
  getPublicPlayers: vi.fn(),
  getPublicLocations: vi.fn(),
}));

vi.mock('../../../hooks/useUserPosition', () => ({
  useUserPosition: vi.fn(),
}));

vi.mock('../../../utils/avatar', () => ({
  getPlayerImageUrl: vi.fn(() => null),
}));

vi.mock('../../../utils/slugify', () => ({
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('../../../utils/playerFilterOptions', () => ({
  PLAYER_LEVEL_FILTER_OPTIONS: [
    { value: '', label: 'All' },
    { value: 'intermediate', label: 'Intermediate' },
  ],
}));

// Stub UI components to avoid stylesheet / Chakra dependencies
vi.mock('../../ui/UI', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children),
}));
vi.mock('../../ui/StarRating', () => ({
  default: () => null,
}));
vi.mock('../../ui/LevelBadge', () => ({
  default: ({ level }: { level: string }) => React.createElement('span', {}, level),
}));

// Stub CSS import — vitest jsdom does not process CSS files
vi.mock('../NearYouSection.css', () => ({}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { getPublicPlayers, getPublicCourts, getPublicLocations } from '../../../services/api';
import { useUserPosition } from '../../../hooks/useUserPosition';
import NearYouSection from '../NearYouSection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Player used as currentUserPlayer prop. */
function makeCurrentPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test User',
    location_id: 'socal_sd',
    location_slug: 'southern-california-san-diego',
    city: 'San Diego',
    state: 'CA',
    city_latitude: 32.7,
    city_longitude: -117.1,
    ...overrides,
  };
}

/** Build a search-API player record with a flat current_rating. */
function makeSearchPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    full_name: 'Jane Doe',
    avatar: null,
    level: 'intermediate',
    current_rating: 1450,
    total_games: 20,
    ...overrides,
  };
}

function setupDefaultMocks() {
  (useUserPosition as ReturnType<typeof vi.fn>).mockReturnValue({
    position: { latitude: 32.7, longitude: -117.1 },
    source: 'profile',
  });
  (getPublicCourts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  (getPublicLocations as ReturnType<typeof vi.fn>).mockResolvedValue({ regions: [] });
  (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NearYouSection — current_rating field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('displays player rating from the flat current_rating field', async () => {
    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSearchPlayer({ current_rating: 1450 })],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1450')).toBeInTheDocument();
    });
  });

  it('rounds the current_rating before display', async () => {
    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSearchPlayer({ current_rating: 1337.7 })],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1338')).toBeInTheDocument();
    });
  });

  it('falls back to 1200 when current_rating is null', async () => {
    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSearchPlayer({ current_rating: null })],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1200')).toBeInTheDocument();
    });
  });

  it('falls back to 1200 when current_rating is undefined', async () => {
    const player = makeSearchPlayer();
    delete player.current_rating;

    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [player],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1200')).toBeInTheDocument();
    });
  });

  it('does NOT read rating from a nested stats object (regression guard)', async () => {
    // Before the fix, the component read player.stats?.current_rating.
    // A player with stats.current_rating=1999 but no top-level current_rating
    // should still show 1200, confirming the nested read was removed.
    const player = {
      ...makeSearchPlayer({ current_rating: undefined }),
      stats: { current_rating: 1999 },
    };

    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [player],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1200')).toBeInTheDocument();
    });

    // Confirm the old nested value is not rendered
    expect(screen.queryByText('1999')).not.toBeInTheDocument();
  });

  it('displays multiple players with their individual ratings', async () => {
    (getPublicPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        makeSearchPlayer({ id: 101, full_name: 'Alice', current_rating: 1500 }),
        makeSearchPlayer({ id: 102, full_name: 'Bob', current_rating: 1300 }),
        makeSearchPlayer({ id: 103, full_name: 'Carol', current_rating: null }),
      ],
    });

    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer()}
        onTabChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1500')).toBeInTheDocument();
      expect(screen.getByText('1300')).toBeInTheDocument();
      expect(screen.getByText('1200')).toBeInTheDocument(); // fallback for Carol
    });
  });
});

describe('NearYouSection — location prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useUserPosition as ReturnType<typeof vi.fn>).mockReturnValue({
      position: null,
      source: null,
    });
  });

  it('shows location prompt when currentUserPlayer has no location_id and no geolocation', () => {
    render(
      <NearYouSection
        currentUserPlayer={makeCurrentPlayer({ location_id: null })}
        onTabChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Set your location to discover courts/i),
    ).toBeInTheDocument();
  });

  it('shows location prompt when currentUserPlayer is null', () => {
    render(
      <NearYouSection currentUserPlayer={null} onTabChange={vi.fn()} />,
    );

    expect(
      screen.getByText(/Set your location to discover courts/i),
    ).toBeInTheDocument();
  });
});
