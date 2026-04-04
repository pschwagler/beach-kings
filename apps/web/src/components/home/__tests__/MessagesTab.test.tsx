/**
 * MessagesTab — unit tests.
 *
 * Focuses on the batchFriendStatus / player-lookup error path:
 * a failed lookup must NOT lock the thread into read-only mode by
 * setting isFriend: false.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockThreadParam: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => ({
    get: (key: string) => (key === 'thread' ? mockThreadParam : null),
  })),
}));

// Notification context
vi.mock('../../../contexts/NotificationContext', () => ({
  useNotifications: vi.fn(() => ({
    onDirectMessageRef: { current: null },
    fetchDmUnreadCount: vi.fn(),
  })),
}));

// Auth context
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentUserPlayer: { id: 10, full_name: 'Test User' },
  })),
}));

// API services — these are what we control per-test
const mockGetConversations = vi.fn();
const mockGetThread = vi.fn();
const mockMarkThreadRead = vi.fn();
const mockBatchFriendStatus = vi.fn();
const mockApiGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
  getConversations: (...args: unknown[]) => mockGetConversations(...args),
  getThread: (...args: unknown[]) => mockGetThread(...args),
  sendMessage: vi.fn(),
  markThreadRead: (...args: unknown[]) => mockMarkThreadRead(...args),
  getFriends: vi.fn().mockResolvedValue({ items: [] }),
  batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
}));

// Avatar utility
vi.mock('../../../utils/avatar', () => ({ isImageUrl: () => false }));
vi.mock('../../../utils/dateUtils', () => ({ formatRelativeTime: () => 'just now' }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockGetConversations.mockResolvedValue({ items: [] });
  mockGetThread.mockResolvedValue({ items: [], has_more: false });
  mockMarkThreadRead.mockResolvedValue({});
  mockBatchFriendStatus.mockResolvedValue({ statuses: {} });
  mockApiGet.mockResolvedValue({ data: { id: 99, full_name: 'Other Player', avatar: null } });
}

// Lazy import so mocks are set up before the module loads
async function renderMessagesTab() {
  const { default: MessagesTab } = await import('../MessagesTab');
  return render(<MessagesTab />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagesTab — batchFriendStatus error path', () => {
  beforeEach(() => {
    mockThreadParam = null;
    mockPush.mockClear();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows conversation list when no thread param is set', async () => {
    await act(async () => {
      await renderMessagesTab();
    });
    // Should show empty state (no conversations)
    await waitFor(() => {
      expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
    });
  });

  it('opens thread as read-write (isFriend=true) when batchFriendStatus confirms friendship', async () => {
    mockThreadParam = '99';
    // Conversation list has no entry for player 99 → falls through to player lookup
    mockGetConversations.mockResolvedValue({ items: [] });
    mockApiGet.mockResolvedValue({
      data: { id: 99, full_name: 'Friend Player', avatar: null },
    });
    mockBatchFriendStatus.mockResolvedValue({ statuses: { '99': 'friend' } });
    mockGetThread.mockResolvedValue({ items: [], has_more: false });

    await act(async () => {
      await renderMessagesTab();
    });

    // Thread should open; input area should be visible (isFriend=true → no readonly notice)
    await waitFor(() => {
      expect(screen.queryByText(/you must be friends to send messages/i)).not.toBeInTheDocument();
    });
  });

  it('does NOT set isFriend=false when batchFriendStatus call fails (transient error)', async () => {
    mockThreadParam = '99';
    mockGetConversations.mockResolvedValue({ items: [] });
    mockApiGet.mockResolvedValue({
      data: { id: 99, full_name: 'Other Player', avatar: null },
    });
    // Simulate a network error on batchFriendStatus
    mockBatchFriendStatus.mockRejectedValue(new Error('Network error'));
    mockGetThread.mockResolvedValue({ items: [], has_more: false });

    await act(async () => {
      await renderMessagesTab();
    });

    // The "not friends" readonly notice must NOT appear after a transient API error
    await waitFor(() => {
      expect(screen.queryByText(/you must be friends to send messages/i)).not.toBeInTheDocument();
    });
  });

  it('does NOT set isFriend=false when the entire player lookup (api.get + batchFriendStatus) fails', async () => {
    mockThreadParam = '42';
    mockGetConversations.mockResolvedValue({ items: [] });
    // Both api.get and batchFriendStatus fail — the outer try/catch is triggered
    mockApiGet.mockRejectedValue(new Error('Player not found'));
    mockBatchFriendStatus.mockRejectedValue(new Error('Network error'));
    mockGetThread.mockResolvedValue({ items: [], has_more: false });

    await act(async () => {
      await renderMessagesTab();
    });

    // When the full player lookup fails, the thread should either not open at all
    // OR open without the "not friends" readonly restriction.
    // In either case the readonly "You must be friends" notice must not appear.
    await waitFor(() => {
      expect(screen.queryByText(/you must be friends to send messages/i)).not.toBeInTheDocument();
    });
  });
});
