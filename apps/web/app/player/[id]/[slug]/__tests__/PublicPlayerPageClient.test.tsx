/**
 * Unit tests for PublicPlayerPageClient.
 *
 * Covers:
 * - HomeMenuBar is rendered in the sidebar shell
 * - NavBar is rendered
 * - PublicPlayerPage is rendered
 * - Sidebar shell CSS classes are present
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the component under test
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockRouterPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/player/42/test-player'),
}));

const mockAuth = {
  user: { id: 1, email: 'test@example.com' },
  currentUserPlayer: { id: 1, full_name: 'Test User' },
  isAuthenticated: true,
  logout: vi.fn(),
};
vi.mock('../../../../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => mockAuth),
}));

vi.mock('../../../../../src/contexts/AuthModalContext', () => ({
  useAuthModal: vi.fn(() => ({ openAuthModal: vi.fn() })),
}));

vi.mock('../../../../../src/contexts/ModalContext', () => ({
  useModal: vi.fn(() => ({ openModal: vi.fn(), closeModal: vi.fn() })),
  MODAL_TYPES: { CREATE_LEAGUE: 'CREATE_LEAGUE' },
}));

const mockGetPublicPlayer = vi.fn();
vi.mock('../../../../../src/services/api', () => ({
  createLeague: vi.fn(),
  getPublicPlayer: (...args: unknown[]) => mockGetPublicPlayer(...args),
}));

vi.mock('../../../../../src/contexts/AppContext', () => ({
  useApp: vi.fn(() => ({ userLeagues: [], refreshLeagues: vi.fn() })),
}));

vi.mock('../../../../../src/components/layout/NavBar', () => ({
  default: () => <nav data-testid="navbar" />,
}));

vi.mock('../../../../../src/components/home/HomeMenuBar', () => ({
  default: ({ activeTab }: { activeTab: string }) => (
    <div data-testid="home-menu-bar" data-active-tab={activeTab} />
  ),
}));

vi.mock('../../../../../src/components/player/PublicPlayerPage', () => ({
  default: ({ player, isAuthenticated }: { player: { stats?: { total_wins: number | null } }; isAuthenticated: boolean }) => (
    <div data-testid="public-player-page" data-is-authenticated={String(isAuthenticated)} data-wins={player.stats?.total_wins ?? 'hidden'} />
  ),
}));

vi.mock('../../../../../src/contexts/NotificationContext', () => ({
  useNotifications: vi.fn(() => ({ dmUnreadCount: 0 })),
}));

// ---------------------------------------------------------------------------
// Import component after mocks are in place
// ---------------------------------------------------------------------------

import PublicPlayerPageClient from '../PublicPlayerPageClient';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testPlayer = {
  id: 42,
  full_name: 'Test Player',
  avatar: null,
  gender: 'male',
  level: 'AA',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublicPlayerPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthenticated = true;
    mockAuth.user = { id: 1, email: 'test@example.com' };
    mockGetPublicPlayer.mockResolvedValue(testPlayer);
  });

  it('refreshes the anonymous profile with the signed-in viewer permissions', async () => {
    mockGetPublicPlayer.mockResolvedValue({ ...testPlayer, stats: { total_wins: 50 } });
    render(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    await waitFor(() => expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', '50'));
    expect(mockGetPublicPlayer).toHaveBeenCalledWith(42, { signal: expect.any(AbortSignal) });
  });

  it('uses the anonymous profile without fetching when signed out', () => {
    mockAuth.isAuthenticated = false;
    render(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    expect(mockGetPublicPlayer).not.toHaveBeenCalled();
    expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', 'hidden');
  });

  it('drops private stats immediately on logout and ignores the old response', async () => {
    let resolveProfile!: (value: unknown) => void;
    mockGetPublicPlayer.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    const view = render(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    const signal = mockGetPublicPlayer.mock.calls[0][1].signal;
    mockAuth.isAuthenticated = false;
    view.rerender(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveProfile({ ...testPlayer, stats: { total_wins: 50 } }); });
    expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', 'hidden');
  });

  it('does not reuse a previous account\'s private stats', async () => {
    mockGetPublicPlayer.mockResolvedValueOnce({ ...testPlayer, stats: { total_wins: 50 } });
    const view = render(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    await waitFor(() => expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', '50'));
    mockGetPublicPlayer.mockReturnValue(new Promise(() => {}));
    mockAuth.user = { id: 2, email: 'another@example.com' };
    view.rerender(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', 'hidden');
  });

  it('does not restore old private stats when the same account signs in again', async () => {
    mockGetPublicPlayer.mockResolvedValueOnce({ ...testPlayer, stats: { total_wins: 50 } });
    const view = render(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    await waitFor(() => expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', '50'));
    mockAuth.isAuthenticated = false;
    view.rerender(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', 'hidden');
    mockGetPublicPlayer.mockReturnValue(new Promise(() => {}));
    mockAuth.isAuthenticated = true;
    view.rerender(<PublicPlayerPageClient player={testPlayer} canonicalSlug="test-player" currentSlug="test-player" />);
    expect(screen.getByTestId('public-player-page')).toHaveAttribute('data-wins', 'hidden');
  });

  it('renders NavBar', () => {
    render(
      <PublicPlayerPageClient
        player={testPlayer}
        canonicalSlug="test-player"
        currentSlug="test-player"
      />,
    );
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });

  it('renders HomeMenuBar inside the sidebar shell', () => {
    render(
      <PublicPlayerPageClient
        player={testPlayer}
        canonicalSlug="test-player"
        currentSlug="test-player"
      />,
    );
    expect(screen.getByTestId('home-menu-bar')).toBeInTheDocument();
  });

  it('renders HomeMenuBar with empty activeTab (no tab highlighted)', () => {
    render(
      <PublicPlayerPageClient
        player={testPlayer}
        canonicalSlug="test-player"
        currentSlug="test-player"
      />,
    );
    expect(screen.getByTestId('home-menu-bar')).toHaveAttribute('data-active-tab', '');
  });

  it('renders PublicPlayerPage', () => {
    render(
      <PublicPlayerPageClient
        player={testPlayer}
        canonicalSlug="test-player"
        currentSlug="test-player"
      />,
    );
    expect(screen.getByTestId('public-player-page')).toBeInTheDocument();
  });

  it('renders sidebar shell with correct CSS classes', () => {
    const { container } = render(
      <PublicPlayerPageClient
        player={testPlayer}
        canonicalSlug="test-player"
        currentSlug="test-player"
      />,
    );
    expect(container.querySelector('.league-dashboard-container')).toBeInTheDocument();
    expect(container.querySelector('.league-dashboard')).toBeInTheDocument();
    expect(container.querySelector('.home-content')).toBeInTheDocument();
  });
});
