/**
 * Unit tests for PublicPlayerPage.
 *
 * Covers:
 * - Mutual friends are fetched when the viewer IS already friends with the player (status === 'friend')
 * - Mutual friends are NOT cleared when a friend request is accepted
 * - A "Back" button is rendered for authenticated users
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the component under test
// ---------------------------------------------------------------------------

const mockRouterBack = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockRouterPush, back: mockRouterBack, replace: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockOpenAuthModal = vi.fn();
vi.mock('../../../contexts/AuthModalContext', () => ({
  useAuthModal: vi.fn(() => ({ openAuthModal: mockOpenAuthModal })),
}));

const mockCurrentUserPlayer = { id: 99, full_name: 'Viewer Player' };
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ currentUserPlayer: mockCurrentUserPlayer })),
}));

const mockGetMutualFriends = vi.fn();
const mockBatchFriendStatus = vi.fn();
const mockSendFriendRequest = vi.fn();
const mockAcceptFriendRequest = vi.fn();
const mockRemoveFriend = vi.fn();
const mockGetFriendRequests = vi.fn();
const mockGetPlayerHomeCourts = vi.fn().mockResolvedValue([]);
const mockSetPlayerHomeCourts = vi.fn();

vi.mock('../../../services/api', () => ({
  batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
  sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
  acceptFriendRequest: (...args: unknown[]) => mockAcceptFriendRequest(...args),
  removeFriend: (...args: unknown[]) => mockRemoveFriend(...args),
  getMutualFriends: (...args: unknown[]) => mockGetMutualFriends(...args),
  getFriendRequests: (...args: unknown[]) => mockGetFriendRequests(...args),
  getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
  setPlayerHomeCourts: (...args: unknown[]) => mockSetPlayerHomeCourts(...args),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock('../../../hooks/useHomeCourts', () => ({
  default: vi.fn(() => ({
    homeCourts: [],
    handleSet: vi.fn(),
    handleRemove: vi.fn(),
    handleSetPrimary: vi.fn(),
  })),
}));

vi.mock('../PlayerTrophies', () => ({
  default: () => <div data-testid="player-trophies" />,
}));

vi.mock('../CourtSelector', () => ({
  default: () => <div data-testid="court-selector" />,
}));

vi.mock('../../ui/UI', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../../ui/LevelBadge', () => ({
  default: () => <span data-testid="level-badge" />,
}));

vi.mock('../../../utils/formatters', () => ({
  formatGender: (g: string) => g,
}));

vi.mock('../../../utils/avatar', () => ({
  isImageUrl: () => false,
}));

vi.mock('../../../utils/slugify', () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}));

// CSS import stub
vi.mock('../PublicPlayerPage.css', () => ({}));

// ---------------------------------------------------------------------------
// Import component after mocks are in place
// ---------------------------------------------------------------------------

import PublicPlayerPage from '../PublicPlayerPage';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const basePlayer = {
  id: 42,
  full_name: 'Test Player',
  avatar: null,
  gender: 'male',
  level: 'AA',
  location: null,
  is_placeholder: false,
  stats: null,
  league_memberships: [],
};

const mutualFriendsList = [
  { player_id: 7, full_name: 'Mutual One', avatar: null },
  { player_id: 8, full_name: 'Mutual Two', avatar: null },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublicPlayerPage — mutual friends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlayerHomeCourts.mockResolvedValue([]);
  });

  it('fetches mutual friends when status is "none"', async () => {
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '42': 'none' } });
    mockGetMutualFriends.mockResolvedValue(mutualFriendsList);

    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);

    await waitFor(() => {
      expect(mockGetMutualFriends).toHaveBeenCalledWith(basePlayer.id);
    });
  });

  it('fetches mutual friends when status IS "friend"', async () => {
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '42': 'friend' } });
    mockGetMutualFriends.mockResolvedValue(mutualFriendsList);

    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);

    await waitFor(() => {
      expect(mockGetMutualFriends).toHaveBeenCalledWith(basePlayer.id);
    });
  });

  it('displays mutual friends section when viewer is already friends and mutual friends exist', async () => {
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '42': 'friend' } });
    mockGetMutualFriends.mockResolvedValue(mutualFriendsList);

    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText('Mutual One')).toBeInTheDocument();
      expect(screen.getByText('Mutual Two')).toBeInTheDocument();
    });
  });

  it('does NOT clear mutual friends when accepting a friend request', async () => {
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '42': 'pending_incoming' } });
    mockGetFriendRequests.mockResolvedValue([{ id: 55, sender_player_id: basePlayer.id }]);
    mockGetMutualFriends.mockResolvedValue(mutualFriendsList);
    mockAcceptFriendRequest.mockResolvedValue({});

    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);

    // Wait for mutual friends to load
    await waitFor(() => {
      expect(screen.getByText('Mutual One')).toBeInTheDocument();
    });

    // Accept the friend request
    const acceptBtn = screen.getByTestId('friend-incoming-btn');
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockAcceptFriendRequest).toHaveBeenCalledWith(55);
    });

    // Mutual friends should still be visible after accepting
    expect(screen.getByText('Mutual One')).toBeInTheDocument();
    expect(screen.getByText('Mutual Two')).toBeInTheDocument();
  });

  it('does not fetch mutual friends for self', async () => {
    const selfPlayer = { ...basePlayer, id: mockCurrentUserPlayer.id };
    render(<PublicPlayerPage player={selfPlayer} isAuthenticated={true} />);

    // useEffect sets friendStatus to 'self' and returns early, no API calls
    await waitFor(() => {
      expect(mockBatchFriendStatus).not.toHaveBeenCalled();
    });
    expect(mockGetMutualFriends).not.toHaveBeenCalled();
  });
});

describe('PublicPlayerPage — Back button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlayerHomeCourts.mockResolvedValue([]);
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '42': 'none' } });
    mockGetMutualFriends.mockResolvedValue([]);
  });

  it('renders a Back button for authenticated users', () => {
    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
  });

  it('does not render a Back button for unauthenticated users', () => {
    render(<PublicPlayerPage player={basePlayer} isAuthenticated={false} />);
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('calls router.back() when history exists', async () => {
    const originalLength = Object.getOwnPropertyDescriptor(window.history, 'length');
    Object.defineProperty(window.history, 'length', { value: 2, configurable: true });
    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);
    await userEvent.click(screen.getByTestId('back-button'));
    expect(mockRouterBack).toHaveBeenCalled();
    if (originalLength) {
      Object.defineProperty(window.history, 'length', originalLength);
    }
  });

  it('navigates to /find-players when no history', async () => {
    const originalLength = Object.getOwnPropertyDescriptor(window.history, 'length');
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    render(<PublicPlayerPage player={basePlayer} isAuthenticated={true} />);
    await userEvent.click(screen.getByTestId('back-button'));
    expect(mockRouterPush).toHaveBeenCalledWith('/find-players');
    if (originalLength) {
      Object.defineProperty(window.history, 'length', originalLength);
    }
  });
});
