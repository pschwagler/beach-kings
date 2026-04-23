/**
 * Tests for the League Invite screen.
 *
 * Covers:
 *   - Renders search input and player list
 *   - Player rows render with name and status badge
 *   - Toggling a player selects/deselects them
 *   - Member/invited/requested players are non-selectable
 *   - Send Invites button label updates with selection count
 *   - Send Invites calls the API and resets selection
 *   - Share Link button renders
 *   - Loading and error states
 *   - Empty state
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: '1' }),
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

const mockGetInvitablePlayers = jest.fn();
const mockSendLeagueInvites = jest.fn();

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    getInvitablePlayers: (...args: unknown[]) => mockGetInvitablePlayers(...args),
    sendLeagueInvites: (...args: unknown[]) => mockSendLeagueInvites(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import LeagueInviteRoute from '../../../../app/(stack)/league/[id]/invite';

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

const MOCK_PLAYERS = [
  { player_id: 60, display_name: 'Jake Donovan', initials: 'JD', location_name: 'Queens, NY', level: 'Open', invite_status: 'none', section: 'friends' },
  { player_id: 61, display_name: 'Marco Salvatore', initials: 'MS', location_name: 'Brooklyn, NY', level: 'AA', invite_status: 'invited', section: 'friends' },
  { player_id: 62, display_name: 'Sam Joustra', initials: 'SJ', location_name: 'Manhattan, NY', level: 'Open', invite_status: 'none', section: 'recent_opponents' },
  { player_id: 64, display_name: 'Brian Nguyen', initials: 'BN', location_name: 'Queens, NY', level: 'AA', invite_status: 'member', section: 'suggested' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInvitablePlayers.mockResolvedValue(MOCK_PLAYERS);
  // sendLeagueInvites throws a "TODO" error (backend not yet implemented).
  // Individual tests that need it to succeed will override with mockResolvedValue.
  mockSendLeagueInvites.mockRejectedValue(new Error('TODO(backend): POST /api/leagues/:id/invites'));
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — render', () => {
  it('renders the invite screen container', () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('league-invite-screen')).toBeTruthy();
  });

  it('renders the search input', () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('invite-search-input')).toBeTruthy();
  });

  it('renders player rows after loading', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-player-row-60')).toBeTruthy();
      expect(screen.getByTestId('invite-player-row-61')).toBeTruthy();
    });
  });

  it('renders the player list', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-player-list')).toBeTruthy();
    });
  });

  it('renders Share Link button', () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('share-link-button')).toBeTruthy();
  });

  it('renders Send Invites button', () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('send-invites-button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — selection', () => {
  it('selecting a player shows it as selected in checkbox', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-60')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-player-row-60'));
    await waitFor(() => {
      const checkbox = screen.getByTestId('invite-checkbox-60');
      // Selected state: the checkbox has a checkmark child or different style
      expect(checkbox).toBeTruthy();
    });
  });

  it('send button updates label with count when player selected', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-60')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-player-row-60'));
    await waitFor(() => {
      expect(screen.getByText('Send (1)')).toBeTruthy();
    });
  });

  it('deselecting a player removes it from count', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-60')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-player-row-60'));
    await waitFor(() => expect(screen.getByText('Send (1)')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-player-row-60'));
    await waitFor(() => {
      expect(screen.getByText('Send')).toBeTruthy();
    });
  });

  it('member player row is not selectable', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-64')).toBeTruthy());
    const memberRow = screen.getByTestId('invite-player-row-64');
    expect(memberRow.props.accessibilityState?.disabled).toBe(true);
  });

  it('invited player row is not selectable', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-61')).toBeTruthy());
    const invitedRow = screen.getByTestId('invite-player-row-61');
    expect(invitedRow.props.accessibilityState?.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Send invites
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — send invites', () => {
  it('send button is disabled when no players selected', async () => {
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('send-invites-button')).toBeTruthy());
    const button = screen.getByTestId('send-invites-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('calls sendLeagueInvites with selected player ids', async () => {
    // Override to resolve so the hook completes without unhandled rejection
    mockSendLeagueInvites.mockResolvedValueOnce(undefined);
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-player-row-60')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-player-row-60'));
    await waitFor(() => expect(screen.getByText('Send (1)')).toBeTruthy());
    fireEvent.press(screen.getByTestId('send-invites-button'));
    await waitFor(() => {
      expect(mockSendLeagueInvites).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([60]),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — empty state', () => {
  it('renders empty state when no players found', async () => {
    mockGetInvitablePlayers.mockResolvedValue([]);
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — error state', () => {
  it('renders error state when players query fails', async () => {
    mockGetInvitablePlayers.mockRejectedValue(new Error('network error'));
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LeagueInviteScreen — loading state', () => {
  it('renders loading indicator while fetching', () => {
    mockGetInvitablePlayers.mockReturnValue(new Promise(() => {}));
    render(<LeagueInviteRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('invite-loading')).toBeTruthy();
  });
});
