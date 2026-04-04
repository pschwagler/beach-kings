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
import { render, screen } from '@testing-library/react';
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

vi.mock('../../../../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, email: 'test@example.com' },
    currentUserPlayer: { id: 1, full_name: 'Test User' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}));

vi.mock('../../../../../src/contexts/AuthModalContext', () => ({
  useAuthModal: vi.fn(() => ({ openAuthModal: vi.fn() })),
}));

vi.mock('../../../../../src/contexts/ModalContext', () => ({
  useModal: vi.fn(() => ({ openModal: vi.fn(), closeModal: vi.fn() })),
  MODAL_TYPES: { CREATE_LEAGUE: 'CREATE_LEAGUE' },
}));

vi.mock('../../../../../src/services/api', () => ({
  getUserLeagues: vi.fn().mockResolvedValue([]),
  createLeague: vi.fn(),
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
  default: ({ isAuthenticated }: { player: unknown; isAuthenticated: boolean }) => (
    <div data-testid="public-player-page" data-is-authenticated={String(isAuthenticated)} />
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
    expect(container.querySelector('.league-dashboard__content')).toBeInTheDocument();
  });
});
