/**
 * Tests for InvitePlayersScreen.
 *
 * Covers: renderTemplate unit logic, "Sent ✓" timer behaviour,
 * empty-state branching, Share.share payload, press-swallow when sent,
 * and the SessionDetailScreen banner integration for both session types.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react-native';
import { Share } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks — stable across all describes
// ---------------------------------------------------------------------------

jest.mock('@beach-kings/shared/tokens', () => ({
  colors: { primary: '#1a3a4a' },
  lightPalette: {
    bgPage: '#f5f5f5',
    bgSurface: '#ffffff',
    bgElevated: '#ffffff',
    bgNav: '#ffffff',
    textDefault: '#1a1a1a',
    textMuted: '#666666',
    textTertiary: '#999999',
    textInverse: '#ffffff',
    borderDivider: '#e5e7eb',
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
    successTint: '#dcfce7',
    dangerTint: '#fee2e2',
    warningTint: '#fef3c7',
    brandTeal: '#0D9488',
    brandGold: '#c8a84b',
  },
  darkPalette: {
    bgPage: '#161b22',
    bgSurface: '#1c2333',
    bgElevated: '#21262d',
    bgNav: '#161b22',
    textDefault: '#e6edf3',
    textMuted: '#8b949e',
    textTertiary: '#6e7681',
    textInverse: '#1a1a1a',
    borderDivider: '#21262d',
    success: '#4ade80',
    danger: '#f87171',
    warning: '#fbbf24',
    successTint: '#14532d',
    dangerTint: '#7f1d1d',
    warningTint: '#78350f',
    brandTeal: '#14b8a6',
    brandGold: '#d4a843',
  },
  darkColors: { brandTeal: '#14b8a6' },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, colorScheme: 'light' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ canGoBack: () => true, push: jest.fn(), back: mockRouterBack }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

// Session-detail invite-banner tests do not exercise court selection and
// intentionally render outside the app's authenticated provider tree.
jest.mock('@/components/screens/Sessions/SessionCourtPicker', () => () => null);

// Spy on Share.share without replacing the whole react-native module —
// jest-expo's preset already provides a working RN test environment;
// jest.requireActual here would re-import native-only modules (DevMenu, etc).
jest.spyOn(Share, 'share').mockImplementation(jest.fn());

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { renderTemplate } from '@/components/screens/Sessions/InvitePlayersScreen';
import InvitePlayersScreen from '@/components/screens/Sessions/InvitePlayersScreen';
import type { InvitePlayersParams } from '@/components/screens/Sessions/InvitePlayersScreen';

const mockShare = Share.share as jest.MockedFunction<typeof Share.share>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PLAYER_BRAD: InvitePlayersParams['players'][number] = {
  id: '101',
  name: 'Brad Kessler',
  initials: 'BK',
  metaLabel: '3 games',
  inviteUrl: 'https://beachleaguevb.com/invite/token-brad',
};

const PLAYER_ALEX: InvitePlayersParams['players'][number] = {
  id: '102',
  name: 'Alex Thompson',
  initials: 'AT',
  metaLabel: '2 games',
  inviteUrl: 'https://beachleaguevb.com/invite/token-alex',
};

const BASE_PARAMS: InvitePlayersParams = {
  contextLabel: 'Sunday Pickup · Apr 6',
  contextSubLabel: '2 unclaimed players',
  players: [PLAYER_BRAD, PLAYER_ALEX],
};

// ---------------------------------------------------------------------------
// Helper: resolve share and advance fake timers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockShare.mockResolvedValue({ action: 'sharedAction' } as any);
});

afterEach(() => {
  jest.useRealTimers();
});

// ===========================================================================
// 1. renderTemplate — unit tests
// ===========================================================================

describe('renderTemplate', () => {
  const defaultTemplate =
    'Hey {firstName}, join me on the Beach League app to claim the games we played together: {url}';

  it('replaces {firstName} with the first word of the player name', () => {
    const result = renderTemplate(defaultTemplate, {
      name: 'Brad Kessler',
      inviteUrl: 'https://example.com/invite/abc',
    });
    expect(result).toContain('Hey Brad,');
  });

  it('replaces {url} with the inviteUrl', () => {
    const result = renderTemplate(defaultTemplate, {
      name: 'Alex Thompson',
      inviteUrl: 'https://example.com/invite/xyz',
    });
    expect(result).toContain('https://example.com/invite/xyz');
  });

  it('handles a single-word name (no space)', () => {
    const result = renderTemplate(defaultTemplate, {
      name: 'Mono',
      inviteUrl: 'https://example.com/invite/mono',
    });
    expect(result).toContain('Hey Mono,');
  });

  it('replaces both placeholders in one pass', () => {
    const result = renderTemplate(defaultTemplate, {
      name: 'Dan Peterson',
      inviteUrl: 'https://beachleaguevb.com/invite/tok',
    });
    expect(result).toBe(
      'Hey Dan, join me on the Beach League app to claim the games we played together: https://beachleaguevb.com/invite/tok',
    );
  });

  it('supports a custom template', () => {
    const result = renderTemplate('Hi {firstName} join here: {url}', {
      name: 'Sam Torres',
      inviteUrl: 'https://x.com',
    });
    expect(result).toBe('Hi Sam join here: https://x.com');
  });
});

// ===========================================================================
// 2. InvitePlayersScreen — list state rendering
// ===========================================================================

describe('InvitePlayersScreen — list state', () => {
  it('renders the context strip label', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('Sunday Pickup · Apr 6')).toBeTruthy();
  });

  it('renders contextSubLabel when provided', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('2 unclaimed players')).toBeTruthy();
  });

  it('renders each player name', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('Brad Kessler')).toBeTruthy();
    expect(screen.getByText('Alex Thompson')).toBeTruthy();
  });

  it('renders each player metaLabel', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('3 games')).toBeTruthy();
    expect(screen.getByText('2 games')).toBeTruthy();
  });

  it('renders player initials in the avatar', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('BK')).toBeTruthy();
    expect(screen.getByText('AT')).toBeTruthy();
  });

  it('renders a Send button for each player row', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    const sendButtons = screen.getAllByText('Send');
    expect(sendButtons).toHaveLength(2);
  });

  it('uses the default title "Invite Players to the App" when no title prop is given', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);
    expect(screen.getByText('Invite Players to the App')).toBeTruthy();
  });

  it('renders a custom title when provided', () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} title="Session Invites" />);
    expect(screen.getByText('Session Invites')).toBeTruthy();
  });
});

// ===========================================================================
// 3. InvitePlayersScreen — empty state
// ===========================================================================

describe('InvitePlayersScreen — empty state', () => {
  const emptyParams: InvitePlayersParams = {
    contextLabel: 'Sunday Pickup · Apr 6',
    players: [],
  };

  it('renders the default empty title', () => {
    render(<InvitePlayersScreen {...emptyParams} />);
    expect(screen.getByText('All players on Beach League')).toBeTruthy();
  });

  it('renders a custom emptyStateCopy when provided', () => {
    render(
      <InvitePlayersScreen
        {...emptyParams}
        emptyStateCopy="Everyone is in!"
      />,
    );
    expect(screen.getByText('Everyone is in!')).toBeTruthy();
  });

  it('renders the spec-prescribed empty subtitle', () => {
    render(<InvitePlayersScreen {...emptyParams} />);
    expect(
      screen.getByText(
        'Everyone in this session already has an account, so all games count automatically.',
      ),
    ).toBeTruthy();
  });

  it('renders a Back button in empty state', () => {
    render(<InvitePlayersScreen {...emptyParams} />);
    expect(screen.getByTestId('invite-empty-back-btn')).toBeTruthy();
  });

  it('calls router.back() when Back button is pressed in empty state', () => {
    render(<InvitePlayersScreen {...emptyParams} />);
    fireEvent.press(screen.getByTestId('invite-empty-back-btn'));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('does not render player rows in empty state', () => {
    render(<InvitePlayersScreen {...emptyParams} />);
    expect(screen.queryByText('Send')).toBeNull();
  });
});

// ===========================================================================
// 4. Share.share payload
// ===========================================================================

describe('InvitePlayersScreen — Share.share interaction', () => {
  it('calls Share.share with the correct message and url on row press', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Hey Brad,'),
        url: 'https://beachleaguevb.com/invite/token-brad',
      }),
    );
  });

  it('calls Share.share when the Send button inside the row is pressed', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-send-btn-102'));
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://beachleaguevb.com/invite/token-alex',
      }),
    );
  });

  it('uses a custom shareMessageTemplate when provided', async () => {
    render(
      <InvitePlayersScreen
        {...BASE_PARAMS}
        shareMessageTemplate="Yo {firstName} check this: {url}"
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Yo Brad check this: https://beachleaguevb.com/invite/token-brad',
      }),
    );
  });
});

// ===========================================================================
// 5. "Sent ✓" indicator — timer and swallow behaviour
// ===========================================================================

describe('InvitePlayersScreen — Sent indicator', () => {
  it('shows "Sent" label after share sheet dismisses', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(screen.getByTestId('invite-sent-indicator-101')).toBeTruthy();
  });

  it('reverts to Send button after ~3 seconds', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(screen.getByTestId('invite-sent-indicator-101')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3_100);
    });

    expect(screen.queryByTestId('invite-sent-indicator-101')).toBeNull();
    expect(screen.getByTestId('invite-send-btn-101')).toBeTruthy();
  });

  it('does not call Share.share a second time when row is pressed while Sent', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    // Press again while Sent ✓ is showing
    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
  });

  it('shares only once for two rapid taps in the same tick (sync guard)', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    // Two presses dispatched before any state flush / re-render — the stale
    // sentIds state would let both through, but the synchronous ref guards it.
    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
      fireEvent.press(screen.getByTestId('invite-send-btn-101'));
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
  });

  it('shows Sent ✓ even when Share.share rejects (user cancels)', async () => {
    mockShare.mockRejectedValueOnce(new Error('dismissed'));

    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(screen.getByTestId('invite-sent-indicator-101')).toBeTruthy();
  });

  it('tracks Sent state independently per row', async () => {
    render(<InvitePlayersScreen {...BASE_PARAMS} />);

    // Send only for BRAD
    await act(async () => {
      fireEvent.press(screen.getByTestId('invite-row-101'));
    });

    expect(screen.getByTestId('invite-sent-indicator-101')).toBeTruthy();
    // Alex's row still shows Send
    expect(screen.getByTestId('invite-send-btn-102')).toBeTruthy();
  });
});

// ===========================================================================
// 6. SessionDetailScreen banner integration
// ===========================================================================

// Re-mock useSessionDetailScreen for these integration tests
const mockUseSessionDetailScreen = jest.fn();
jest.mock(
  '@/components/screens/Sessions/useSessionDetailScreen',
  () => ({
    useSessionDetailScreen: (...args: unknown[]) =>
      mockUseSessionDetailScreen(...args),
  }),
);

jest.mock('@/components/screens/Sessions/SessionBottomSheet', () => () => null);
jest.mock('@/components/screens/Sessions/SessionDetailSkeleton', () => () => null);
jest.mock('@/components/screens/Sessions/SessionDetailErrorState', () => () => null);
jest.mock('@/components/screens/Sessions/SessionPlayerChip', () => () => null);

const mockSetPending = jest.fn();
jest.mock('@/contexts/InvitePlayersContext', () => ({
  useInvitePlayers: () => ({ pending: null, setPending: mockSetPending }),
}));

import type { SessionDetail, SessionPlayer } from '@beach-kings/shared';
import SessionDetailScreen from '@/components/screens/Sessions/SessionDetailScreen';

const makePlaceholder = (id: number, name: string, gameCount: number, inviteUrl: string): SessionPlayer => ({
  entry_id: id,
  player_id: null,
  display_name: name,
  initials: name.split(' ').map((w: string) => w[0]).join('').toUpperCase(),
  is_placeholder: true,
  game_count: gameCount,
  invite_url: inviteUrl,
});

const makeRealPlayer = (id: number, name: string): SessionPlayer => ({
  entry_id: id,
  player_id: id,
  display_name: name,
  initials: name.split(' ').map((w: string) => w[0]).join('').toUpperCase(),
  is_placeholder: false,
  game_count: 1,
  invite_url: null,
});

const basePickupSession: SessionDetail = {
  id: 1,
  code: null,
  league_id: null,
  league_name: null,
  court_id: 1,
  court_name: 'Court A',
  date: '2025-06-01',
  start_time: null,
  session_number: 1,
  status: 'submitted',
  session_type: 'pickup',
  is_ranked: false,
  user_wins: 1,
  user_losses: 0,
  user_rating_change: null,
  players: [
    makeRealPlayer(1, 'Patrick Schwagler'),
    makePlaceholder(101, 'Brad Kessler', 3, 'https://beachleaguevb.com/invite/tok-brad'),
  ],
  games: [],
};

const baseLeagueSession: SessionDetail = {
  ...basePickupSession,
  id: 2,
  session_type: 'league',
  league_id: 10,
  league_name: 'Sunday League',
  players: [
    makeRealPlayer(1, 'Patrick Schwagler'),
    makePlaceholder(102, 'Alex Thompson', 2, 'https://beachleaguevb.com/invite/tok-alex'),
  ],
};

const defaultHookResult = {
  session: basePickupSession,
  isLoading: false,
  error: null,
  isRefreshing: false,
  isMenuOpen: false,
  isSubmitting: false,
  submitError: null,
  currentPlayerName: 'Patrick Schwagler',
  onRefresh: jest.fn(),
  onRetry: jest.fn(),
  openMenu: jest.fn(),
  closeMenu: jest.fn(),
  onAddGame: jest.fn(),
  onEditGame: jest.fn(),
  onSubmitSession: jest.fn(),
  onClearSubmitError: jest.fn(),
};

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    canGoBack: () => true,
    push: mockRouterPush,
    back: mockRouterBack,
  }),
}));

describe('SessionDetailScreen — invite banner integration', () => {
  beforeEach(() => {
    mockSetPending.mockClear();
    mockRouterPush.mockClear();
  });

  it('renders the invite banner when there are placeholder players', () => {
    mockUseSessionDetailScreen.mockReturnValue(defaultHookResult);
    render(<SessionDetailScreen sessionId={1} />);
    expect(screen.getByTestId('session-invite-banner')).toBeTruthy();
  });

  it('does not render the invite banner when no placeholders', () => {
    mockUseSessionDetailScreen.mockReturnValue({
      ...defaultHookResult,
      session: {
        ...basePickupSession,
        players: [makeRealPlayer(1, 'Patrick Schwagler')],
      },
    });
    render(<SessionDetailScreen sessionId={1} />);
    expect(screen.queryByTestId('session-invite-banner')).toBeNull();
  });

  it('sets InvitePlayersContext and navigates to invite-players for a pickup session', () => {
    mockUseSessionDetailScreen.mockReturnValue(defaultHookResult);
    render(<SessionDetailScreen sessionId={1} />);

    fireEvent.press(screen.getByTestId('session-invite-banner'));

    expect(mockSetPending).toHaveBeenCalledTimes(1);
    const callArg = mockSetPending.mock.calls[0][0] as InvitePlayersParams;
    expect(callArg.players).toHaveLength(1);
    expect(callArg.players[0].name).toBe('Brad Kessler');
    expect(callArg.players[0].inviteUrl).toBe('https://beachleaguevb.com/invite/tok-brad');
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('invite-players'),
    );
  });

  it('sets InvitePlayersContext and navigates to invite-players for a league session', () => {
    mockUseSessionDetailScreen.mockReturnValue({
      ...defaultHookResult,
      session: baseLeagueSession,
    });
    render(<SessionDetailScreen sessionId={2} />);

    fireEvent.press(screen.getByTestId('session-invite-banner'));

    expect(mockSetPending).toHaveBeenCalledTimes(1);
    const callArg = mockSetPending.mock.calls[0][0] as InvitePlayersParams;
    expect(callArg.players).toHaveLength(1);
    expect(callArg.players[0].name).toBe('Alex Thompson');
    expect(callArg.players[0].inviteUrl).toBe('https://beachleaguevb.com/invite/tok-alex');
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('invite-players'),
    );
  });
});
