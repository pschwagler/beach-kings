/**
 * NotificationsTab — unit tests.
 *
 * Covers:
 * - When the notifications list is empty, renders "No notifications yet."
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — stable references to avoid infinite render loops
// ---------------------------------------------------------------------------

const EMPTY_NOTIFICATIONS: never[] = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../../contexts/NotificationContext', () => ({
  useNotifications: vi.fn(() => ({
    notifications: EMPTY_NOTIFICATIONS,
    isLoading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    fetchNotifications: vi.fn().mockResolvedValue(undefined),
    fetchUnreadCount: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('../../../services/api', () => ({
  approveLeagueJoinRequest: vi.fn(),
  rejectLeagueJoinRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Bell: () => 'Bell',
  Check: () => 'Check',
  Filter: () => 'Filter',
}));

vi.mock('../../notifications/NotificationInbox.css', () => ({}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import NotificationsTab from '../NotificationsTab';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationsTab — empty state', () => {
  it('renders "No notifications yet." when there are no notifications', () => {
    render(<NotificationsTab />);
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });
});
