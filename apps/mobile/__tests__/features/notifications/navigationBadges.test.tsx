import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  navigationBadgeCounts,
  useNavigationBadgeCounts,
} from '@/features/notifications/badges';

const mockGetFriendRequests = jest.fn();
const mockGetReceivedLeagueInvites = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/features/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 12, dmUnreadCount: 3 }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getFriendRequests: (...args: unknown[]) => mockGetFriendRequests(...args),
    getReceivedLeagueInvites: (...args: unknown[]) =>
      mockGetReceivedLeagueInvites(...args),
  },
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('navigation badge scopes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFriendRequests.mockResolvedValue([
      { id: 1, status: 'pending' },
      { id: 2, status: 'pending' },
      { id: 3, status: 'accepted' },
    ]);
    mockGetReceivedLeagueInvites.mockResolvedValue([
      { id: 10, status: 'pending' },
      { id: 11, status: 'pending' },
      { id: 12, status: 'declined' },
    ]);
  });

  it('documents independent global, Social, and Leagues semantics', () => {
    expect(navigationBadgeCounts({
      allUnreadNotifications: 12,
      unreadDirectMessages: 3,
      incomingFriendRequests: 2,
      pendingLeagueInvitations: 4,
    })).toEqual({ global: 12, social: 5, leagues: 4 });
  });

  it('loads attributable counts from user-scoped queries', async () => {
    const { result } = renderHook(() => useNavigationBadgeCounts(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual({ global: 12, social: 5, leagues: 2 });
    });
    expect(mockGetFriendRequests).toHaveBeenCalledWith('incoming');
    expect(mockGetReceivedLeagueInvites).toHaveBeenCalledTimes(1);
  });
});
