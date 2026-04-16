/**
 * Integration tests for SessionPlayersModal friend-status wiring.
 *
 * Verifies that batchFriendStatus responses flow correctly through
 * to SessionPlayersInSessionPanel rendering (badges, buttons).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  X: ({ size }: { size: number }) => <span data-testid="icon-x">{size}</span>,
  Users: ({ size }: { size: number }) => <span data-testid="icon-users">{size}</span>,
  UserPlus: ({ size }: { size: number }) => <span data-testid="icon-user-plus">{size}</span>,
  MapPin: ({ size }: { size: number }) => <span data-testid="icon-map-pin">{size}</span>,
  Check: ({ size }: { size: number }) => <span data-testid="icon-check">{size}</span>,
  Clock: ({ size }: { size: number }) => <span data-testid="icon-clock">{size}</span>,
}));

vi.mock('../../../utils/divisionUtils', () => ({
  formatDivisionLabel: (gender?: string | null, level?: string | null) =>
    [gender, level].filter(Boolean).join(' ') || '',
}));

// Mock useUserPosition — returns no position
vi.mock('../../../hooks/useUserPosition', () => ({
  useUserPosition: () => ({ position: null }),
}));

// Mock ToastContext
const mockShowToast = vi.fn();
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock API services
vi.mock('../../../services/api', () => ({
  getPlayerHomeCourts: vi.fn().mockResolvedValue([]),
  getNearbyCourts: vi.fn().mockResolvedValue([]),
}));

// Mock friend endpoints
const mockBatchFriendStatus = vi.fn();
const mockSendFriendRequest = vi.fn();
vi.mock('../../../services/endpoints/friends', () => ({
  batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
  sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
}));

// Mock CourtSelector to avoid its internal dependencies
vi.mock('../../court/CourtSelector', () => ({
  default: () => <div data-testid="court-selector" />,
}));

// Mock SessionPlayersAddPanel to avoid its complexity
vi.mock('../SessionPlayersAddPanel', () => ({
  default: () => <div data-testid="add-panel" />,
}));

// Mock the hook — we control localParticipants and drawerView
const mockHandleClose = vi.fn();
const mockHandleRemove = vi.fn();
const mockSetDrawerView = vi.fn();
let hookLocalParticipants = [
  { player_id: 1, full_name: 'Alice', gender: 'F', level: 'A' },
  { player_id: 2, full_name: 'Bob', gender: 'M', level: 'B' },
  { player_id: 3, full_name: 'Carol', gender: 'F', level: 'AA', is_placeholder: true },
];
let hookDrawerView = 'in-session';

vi.mock('../hooks/useSessionPlayersModal', () => ({
  useSessionPlayersModal: () => ({
    localParticipants: hookLocalParticipants,
    setDrawerView: mockSetDrawerView,
    drawerView: hookDrawerView,
    items: [],
    total: 0,
    offset: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    searchTerm: '',
    setSearchTerm: vi.fn(),
    locationIds: [],
    leagueIds: [],
    genderFilters: [],
    levelFilters: [],
    locations: [],
    leagues: [],
    removingId: null,
    pendingAddIds: new Set<number>(),
    filtersOpen: false,
    setFiltersOpen: vi.fn(),
    participantIds: new Set(hookLocalParticipants.map((p) => p.player_id)),
    activeFilterCount: 0,
    filterButtonRef: { current: null },
    filterPopoverRef: { current: null },
    handleClose: mockHandleClose,
    handleLoadMore: vi.fn(),
    handleRemove: mockHandleRemove,
    handleAdd: vi.fn(),
    handleRemoveFilter: vi.fn(),
    handleToggleFilter: vi.fn(),
    handleCreatePlaceholder: vi.fn(),
    isCreatingPlaceholder: false,
    handleSearchPlayers: vi.fn(),
    userLocationId: null,
  }),
}));

// Lazy import so mocks are established before module loads
async function renderModal(overrides: Record<string, unknown> = {}) {
  const { default: SessionPlayersModal } = await import('../SessionPlayersModal');
  return render(
    <SessionPlayersModal
      isOpen={true}
      sessionId={100}
      participants={hookLocalParticipants}
      currentUserPlayerId={1}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...overrides}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionPlayersModal — batchFriendStatus integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookDrawerView = 'in-session';
    hookLocalParticipants = [
      { player_id: 1, full_name: 'Alice', gender: 'F', level: 'A' },
      { player_id: 2, full_name: 'Bob', gender: 'M', level: 'B' },
      { player_id: 3, full_name: 'Carol', gender: 'F', level: 'AA', is_placeholder: true },
    ];
  });

  it('renders "Friends" badge when batchFriendStatus returns friend status', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'friend' },
      mutual_counts: { '2': 1 },
    });

    await renderModal();

    await waitFor(() => {
      expect(screen.getByTitle('Friends')).toBeInTheDocument();
    });
    // Bob should not have an "Add Friend" button
    expect(screen.queryByRole('button', { name: /Add Bob as friend/i })).not.toBeInTheDocument();
  });

  it('renders "Add Friend" button when batchFriendStatus returns none status', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });

    await renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });
  });

  it('renders "Pending" badge when batchFriendStatus returns pending_outgoing', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'pending_outgoing' },
      mutual_counts: {},
    });

    await renderModal();

    await waitFor(() => {
      expect(screen.getByTitle('Friend request pending')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Add Bob as friend/i })).not.toBeInTheDocument();
  });

  it('does not render friend buttons for self (currentUserPlayerId)', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });

    await renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });
    // Alice is self (player_id=1 = currentUserPlayerId), no friend button
    expect(screen.queryByRole('button', { name: /Add Alice as friend/i })).not.toBeInTheDocument();
  });

  it('does not render friend buttons for placeholder participants', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });

    await renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });
    // Carol is placeholder, no friend button
    expect(screen.queryByRole('button', { name: /Add Carol as friend/i })).not.toBeInTheDocument();
  });

  it('calls batchFriendStatus with non-self, non-placeholder player IDs', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });

    await renderModal();

    await waitFor(() => {
      expect(mockBatchFriendStatus).toHaveBeenCalledWith([2]);
    });
  });

  it('calls sendFriendRequest and updates to pending on Add Friend click', async () => {
    const user = userEvent.setup();
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });
    mockSendFriendRequest.mockResolvedValue({});

    await renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add Bob as friend/i }));

    expect(mockSendFriendRequest).toHaveBeenCalledWith(2);
    // After optimistic update, should show pending badge
    await waitFor(() => {
      expect(screen.getByTitle('Friend request pending')).toBeInTheDocument();
    });
  });

  it('reverts to original status and shows toast on sendFriendRequest failure', async () => {
    const user = userEvent.setup();
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '2': 'none' },
      mutual_counts: {},
    });
    mockSendFriendRequest.mockRejectedValue(new Error('Network error'));

    await renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add Bob as friend/i }));

    // Should revert to showing "Add Friend" button after failure
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith('Failed to send friend request', 'error');
  });
});
