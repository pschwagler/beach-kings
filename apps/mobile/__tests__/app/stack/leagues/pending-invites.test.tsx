/**
 * Tests for the Pending Invites screen.
 *
 * Covers:
 *   - Renders invite rows with player name, league name, date, status badge
 *   - Accepted invites show "Joined" badge
 *   - Pending invites show "Pending" badge
 *   - Declined invites show "Declined" badge
 *   - Empty state when no invites exist
 *   - Loading state while fetching
 *   - Error state when query fails
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
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

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetPendingInvites = jest.fn();

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    getPendingInvites: () => mockGetPendingInvites(),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import PendingInvitesRoute from '../../../../app/(stack)/pending-invites';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MOCK_INVITES = [
  {
    id: 1,
    league_id: 10,
    league_name: 'Manhattan Open',
    player_id: 60,
    display_name: 'Jake Donovan',
    initials: 'JD',
    invited_at: '2025-06-01T12:00:00Z',
    status: 'pending',
  },
  {
    id: 2,
    league_id: 10,
    league_name: 'Manhattan Open',
    player_id: 61,
    display_name: 'Marco Salvatore',
    initials: 'MS',
    invited_at: '2025-05-20T10:00:00Z',
    status: 'accepted',
  },
  {
    id: 3,
    league_id: 11,
    league_name: 'Brooklyn AA',
    player_id: 62,
    display_name: 'Sam Joustra',
    initials: 'SJ',
    invited_at: '2025-05-10T09:00:00Z',
    status: 'declined',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPendingInvites.mockResolvedValue(MOCK_INVITES);
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('PendingInvitesScreen — render', () => {
  it('renders the pending invites screen list', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('pending-invites-screen')).toBeTruthy();
    });
  });

  it('renders an invite row for each invite', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-row-1')).toBeTruthy();
      expect(screen.getByTestId('invite-row-2')).toBeTruthy();
      expect(screen.getByTestId('invite-row-3')).toBeTruthy();
    });
  });

  it('renders display name in each row', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Jake Donovan')).toBeTruthy();
      expect(screen.getByText('Marco Salvatore')).toBeTruthy();
      expect(screen.getByText('Sam Joustra')).toBeTruthy();
    });
  });

  it('renders league name in each row', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getAllByText('Manhattan Open').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Brooklyn AA')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

describe('PendingInvitesScreen — status badges', () => {
  it('renders Pending badge for pending invites', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeTruthy();
    });
  });

  it('renders Joined badge for accepted invites', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Joined')).toBeTruthy();
    });
  });

  it('renders Declined badge for declined invites', async () => {
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Declined')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('PendingInvitesScreen — empty state', () => {
  it('renders empty state when no invites exist', async () => {
    mockGetPendingInvites.mockResolvedValue([]);
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('pending-invites-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('PendingInvitesScreen — loading state', () => {
  it('renders loading indicator while fetching', () => {
    mockGetPendingInvites.mockReturnValue(new Promise(() => {}));
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('pending-invites-loading')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('PendingInvitesScreen — error state', () => {
  it('renders error state when query fails', async () => {
    mockGetPendingInvites.mockRejectedValue(new Error('network error'));
    render(<PendingInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('pending-invites-error')).toBeTruthy();
    });
  });
});
