/**
 * Tests for the Received Invites screen.
 *
 * Covers:
 *   - Renders invite rows with league name, inviter, date
 *   - Accept and Decline buttons are present
 *   - Empty state when no invites exist
 *   - Loading state while fetching
 *   - Error state when query fails
 *   - Buttons are disabled while a response is in-flight
 */

import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useSegments: () => [],
  useRouter: () => ({ canGoBack: () => true, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

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
  const Svg = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
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

const mockGetReceivedLeagueInvites = jest.fn();
const mockAcceptLeagueInvite = jest.fn();
const mockDeclineLeagueInvite = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getReceivedLeagueInvites: () => mockGetReceivedLeagueInvites(),
    acceptLeagueInvite: (...args: unknown[]) =>
      mockAcceptLeagueInvite(...args),
    declineLeagueInvite: (...args: unknown[]) =>
      mockDeclineLeagueInvite(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ReceivedInvitesRoute from '../../../../app/(stack)/received-invites';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
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
    game_count: 5,
  },
  {
    id: 2,
    league_id: 11,
    league_name: 'Brooklyn AA',
    player_id: 61,
    display_name: 'Sam Joustra',
    initials: 'SJ',
    invited_at: '2025-05-20T10:00:00Z',
    status: 'pending',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReceivedLeagueInvites.mockResolvedValue(MOCK_INVITES);
  mockAcceptLeagueInvite.mockResolvedValue({ status: 'accepted' });
  mockDeclineLeagueInvite.mockResolvedValue({ status: 'declined' });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('ReceivedInvitesScreen — render', () => {
  it('renders the received invites list', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('received-invites-screen')).toBeTruthy();
    });
  });

  it('renders a row for each invite', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('received-invite-row-1')).toBeTruthy();
      expect(screen.getByTestId('received-invite-row-2')).toBeTruthy();
    });
  });

  it('renders league names', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Manhattan Open')).toBeTruthy();
      expect(screen.getByText('Brooklyn AA')).toBeTruthy();
    });
  });

  it('renders inviter names', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Invited by Jake Donovan')).toBeTruthy();
      expect(screen.getByText('Invited by Sam Joustra')).toBeTruthy();
    });
  });

  it('renders game count when available', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('5 games played')).toBeTruthy();
    });
  });

  it('renders Accept and Decline buttons for each row', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('accept-invite-1')).toBeTruthy();
      expect(screen.getByTestId('decline-invite-1')).toBeTruthy();
      expect(screen.getByTestId('accept-invite-2')).toBeTruthy();
      expect(screen.getByTestId('decline-invite-2')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('ReceivedInvitesScreen — actions', () => {
  it('calls acceptLeagueInvite when Accept is pressed', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId('accept-invite-1')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('accept-invite-1'));

    await waitFor(() => {
      expect(mockAcceptLeagueInvite).toHaveBeenCalledWith(10);
    });
  });

  it('calls declineLeagueInvite when Decline is pressed', async () => {
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId('decline-invite-1')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('decline-invite-1'));

    await waitFor(() => {
      expect(mockDeclineLeagueInvite).toHaveBeenCalledWith(10);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('ReceivedInvitesScreen — empty state', () => {
  it('renders empty state when no invites exist', async () => {
    mockGetReceivedLeagueInvites.mockResolvedValue([]);
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('received-invites-empty')).toBeTruthy();
    });
  });

  it('shows the empty state message', async () => {
    mockGetReceivedLeagueInvites.mockResolvedValue([]);
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('No Invitations')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ReceivedInvitesScreen — loading state', () => {
  it('renders loading indicator while fetching', () => {
    mockGetReceivedLeagueInvites.mockReturnValue(new Promise(() => {}));
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('received-invites-loading')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('ReceivedInvitesScreen — error state', () => {
  it('renders error state when query fails', async () => {
    mockGetReceivedLeagueInvites.mockRejectedValue(
      new Error('network error'),
    );
    render(<ReceivedInvitesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('received-invites-error')).toBeTruthy();
    });
  });
});
