/**
 * Tests for SessionDetailScreen — "My Games" / "All Games" toggle and "You" substitution.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/components/screens/Sessions/SessionBottomSheet', () => () => null);
jest.mock('@/components/screens/Sessions/SessionDetailSkeleton', () => () => null);
jest.mock('@/components/screens/Sessions/SessionDetailErrorState', () => () => null);
jest.mock('@/components/screens/Sessions/SessionPlayerChip', () => () => null);

const mockUseSessionDetailScreen = jest.fn();
jest.mock(
  '@/components/screens/Sessions/useSessionDetailScreen',
  () => ({ useSessionDetailScreen: (...args: unknown[]) => mockUseSessionDetailScreen(...args) }),
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { SessionDetail, SessionGame } from '@beach-kings/shared';

const makeGame = (id: number, p1: string, p2: string, p3: string, p4: string): SessionGame => ({
  id,
  game_number: id,
  team1_player1_id: 1,
  team1_player2_id: 2,
  team2_player1_id: 3,
  team2_player2_id: 4,
  team1_player1_name: p1,
  team1_player2_name: p2,
  team2_player1_name: p3,
  team2_player2_name: p4,
  team1_score: 15,
  team2_score: 12,
  winner: 1,
  rating_change: 3.0,
  is_ranked: true,
});

const baseSession: SessionDetail = {
  id: 42,
  code: null,
  league_id: null,
  league_name: null,
  court_name: 'Court A',
  date: '2025-06-01',
  start_time: null,
  session_number: 1,
  status: 'submitted',
  session_type: 'pickup',
  max_players: null,
  notes: null,
  user_wins: 2,
  user_losses: 1,
  user_rating_change: 4.2,
  players: [],
  games: [
    makeGame(1, 'Patrick Schwagler', 'Alex Chen', 'Sam Torres', 'Jordan Lee'),
    // Game 2: Patrick is on team2 with a different partner to avoid duplicate text
    makeGame(2, 'Sam Torres', 'Jordan Lee', 'Patrick Schwagler', 'Maya Rivera'),
    makeGame(3, 'Sam Torres', 'Jordan Lee', 'Tyler Kim', 'River Park'),
  ],
};

const defaultHookResult = {
  session: baseSession,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import SessionDetailScreen from '@/components/screens/Sessions/SessionDetailScreen';

describe('SessionDetailScreen — games filter toggle', () => {
  beforeEach(() => {
    mockUseSessionDetailScreen.mockReturnValue(defaultHookResult);
  });

  it('renders the "My Games" and "All Games" segments when user has games', () => {
    render(<SessionDetailScreen sessionId={42} />);
    expect(screen.getByText('My Games')).toBeTruthy();
    expect(screen.getByText('All Games')).toBeTruthy();
  });

  it('defaults to "My Games" — shows only user games', () => {
    render(<SessionDetailScreen sessionId={42} />);
    // Games 1 and 2 contain Patrick; game 3 does not.
    // "My Games" default means game 3 card should not be visible.
    expect(screen.queryByTestId('session-game-card-3')).toBeNull();
    expect(screen.getByTestId('session-game-card-1')).toBeTruthy();
    expect(screen.getByTestId('session-game-card-2')).toBeTruthy();
  });

  it('shows all games when "All Games" segment is tapped', () => {
    render(<SessionDetailScreen sessionId={42} />);
    fireEvent.press(screen.getByText('All Games'));
    expect(screen.getByTestId('session-game-card-1')).toBeTruthy();
    expect(screen.getByTestId('session-game-card-2')).toBeTruthy();
    expect(screen.getByTestId('session-game-card-3')).toBeTruthy();
  });

  it('returns to filtered view when "My Games" is tapped after "All Games"', () => {
    render(<SessionDetailScreen sessionId={42} />);
    fireEvent.press(screen.getByText('All Games'));
    fireEvent.press(screen.getByText('My Games'));
    expect(screen.queryByTestId('session-game-card-3')).toBeNull();
  });

  it('shows counts in toggle segments (My Games count / All Games count)', () => {
    render(<SessionDetailScreen sessionId={42} />);
    // My count = 2 (games 1 and 2), all count = 3.
    // Use getAllByText since "3" also appears in the stats bar (total game count).
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('hides toggle when currentPlayerName is null', () => {
    mockUseSessionDetailScreen.mockReturnValue({
      ...defaultHookResult,
      currentPlayerName: null,
    });
    render(<SessionDetailScreen sessionId={42} />);
    expect(screen.queryByText('My Games')).toBeNull();
    expect(screen.queryByText('All Games')).toBeNull();
  });

  it('hides toggle when user has no games in the session', () => {
    mockUseSessionDetailScreen.mockReturnValue({
      ...defaultHookResult,
      session: {
        ...baseSession,
        games: [
          makeGame(1, 'Sam Torres', 'Jordan Lee', 'Tyler Kim', 'River Park'),
        ],
      },
      currentPlayerName: 'Patrick Schwagler',
    });
    render(<SessionDetailScreen sessionId={42} />);
    expect(screen.queryByText('My Games')).toBeNull();
    expect(screen.queryByText('All Games')).toBeNull();
  });
});

describe('SessionDetailScreen — "You" substitution in game cards', () => {
  beforeEach(() => {
    mockUseSessionDetailScreen.mockReturnValue(defaultHookResult);
  });

  it('shows "You" in place of the current user name in My Games view', () => {
    render(<SessionDetailScreen sessionId={42} />);
    // Game 1: Patrick is team1_player1 → "You / Alex Chen"
    expect(screen.getByText('You / Alex Chen')).toBeTruthy();
  });

  it('shows "You" when user is on team2', () => {
    render(<SessionDetailScreen sessionId={42} />);
    // Game 2: Patrick is team2_player1 with partner Maya Rivera → "You / Maya Rivera"
    expect(screen.getByText('You / Maya Rivera')).toBeTruthy();
  });

  it('shows full names when currentPlayerName is null', () => {
    mockUseSessionDetailScreen.mockReturnValue({
      ...defaultHookResult,
      currentPlayerName: null,
      session: {
        ...baseSession,
        games: [makeGame(1, 'Patrick Schwagler', 'Alex Chen', 'Sam Torres', 'Jordan Lee')],
      },
    });
    render(<SessionDetailScreen sessionId={42} />);
    expect(screen.getByText('Patrick Schwagler / Alex Chen')).toBeTruthy();
  });
});
