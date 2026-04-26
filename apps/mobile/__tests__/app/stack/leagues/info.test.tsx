/**
 * Tests for the League Info tab.
 *
 * Covers:
 *   - Loading state
 *   - Error state when API fails
 *   - Description section renders when present
 *   - Members list renders with roles
 *   - Seasons list renders with active/past badge
 *   - League info section (access type, level, location)
 *   - Join requests visible to admin, hidden from member
 *   - Approve/deny request calls correct API method
 *   - Leave League button visible for member, hidden for admin
 *   - Leave League calls api.leaveLeague after confirmation
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '1' }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockGetLeague = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockGetLeagueJoinRequests = jest.fn();
const mockApproveJoinRequest = jest.fn();
const mockRejectJoinRequest = jest.fn();
const mockLeaveLeague = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeague: (...args) => mockGetLeague(...args),
    getLeagueMembers: (...args) => mockGetLeagueMembers(...args),
    getLeagueSeasons: (...args) => mockGetLeagueSeasons(...args),
    getLeagueJoinRequests: (...args) => mockGetLeagueJoinRequests(...args),
    approveJoinRequest: (...args) => mockApproveJoinRequest(...args),
    rejectJoinRequest: (...args) => mockRejectJoinRequest(...args),
    leaveLeague: (...args) => mockLeaveLeague(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import LeagueInfoTab from '../../../../src/components/screens/Leagues/LeagueInfoTab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  id: 1,
  description: 'Monday night beach volleyball league.',
  is_open: true,
  level: 'Intermediate',
  location_name: 'San Diego, CA',
  home_courts: [{ id: 'court-1', name: 'Kearny Mesa Park', address: null, position: 0 }],
};

const MOCK_MEMBERS = [
  { player_id: 10, player_name: 'Patrick Schwagler', role: 'admin', joined_at: '2025-01-01' },
  { player_id: 11, player_name: 'Jane Smith', role: 'member', joined_at: '2025-02-01' },
];

const MOCK_SEASONS = [
  {
    id: 3,
    name: 'Summer 2025',
    start_date: '2025-06-01',
    end_date: null,
    is_active: true,
    session_count: 8,
    game_count: 40,
  },
  {
    id: 2,
    name: 'Spring 2025',
    start_date: '2025-03-01',
    end_date: '2025-05-31',
    is_active: false,
    session_count: 6,
    game_count: 30,
  },
];

const MOCK_JOIN_REQUEST = {
  id: 5,
  player_id: 20,
  display_name: 'Alex Tran',
  requested_at: '2025-07-01T00:00:00',
  status: 'pending',
};

const MOCK_JOIN_REQUESTS_EMPTY = { pending: [], rejected: [] };
const MOCK_JOIN_REQUESTS_WITH_PENDING = {
  pending: [MOCK_JOIN_REQUEST],
  rejected: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeague.mockResolvedValue(MOCK_LEAGUE);
  mockGetLeagueMembers.mockResolvedValue(MOCK_MEMBERS);
  mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
  mockGetLeagueJoinRequests.mockResolvedValue(MOCK_JOIN_REQUESTS_EMPTY);
  mockApproveJoinRequest.mockResolvedValue({ success: true });
  mockRejectJoinRequest.mockResolvedValue({ success: true });
  mockLeaveLeague.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — loading', () => {
  it('shows loading indicator while data is fetching', async () => {
    mockGetLeague.mockReturnValue(new Promise(() => {}));

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    expect(screen.getByTestId('info-loading')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — error', () => {
  it('shows error state when league query fails', async () => {
    mockGetLeague.mockRejectedValue(new Error('Network error'));

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('info-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — description', () => {
  it('renders description when present', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Monday night beach volleyball league.')).toBeTruthy();
    });
  });

  it('does not show description section when null', async () => {
    mockGetLeague.mockResolvedValue({ ...MOCK_LEAGUE, description: null });

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(screen.queryByText('Description')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — members', () => {
  it('renders a row for each member', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('member-row-10')).toBeTruthy();
      expect(screen.getByTestId('member-row-11')).toBeTruthy();
    });
  });

  it('shows member display names', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Patrick Schwagler')).toBeTruthy();
      expect(screen.getByText('Jane Smith')).toBeTruthy();
    });
  });

  it('shows Admin badge for admin role', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — seasons', () => {
  it('renders a row for each season', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('season-row-3')).toBeTruthy();
      expect(screen.getByTestId('season-row-2')).toBeTruthy();
    });
  });

  it('shows "Active" badge for is_active season', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  it('shows "Past" badge for inactive season', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Past')).toBeTruthy();
    });
  });

  it('shows session count for a season', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/8 sessions/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// League info rows
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — league info section', () => {
  it('shows location name', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('San Diego, CA')).toBeTruthy();
    });
  });

  it('shows "Public" for open league', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Public')).toBeTruthy();
    });
  });

  it('shows "Invite Only" for closed league', async () => {
    mockGetLeague.mockResolvedValue({ ...MOCK_LEAGUE, is_open: false });

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Invite Only')).toBeTruthy();
    });
  });

  it('shows home court name', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kearny Mesa Park')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — join requests', () => {
  it('does not show join requests section for member role', async () => {
    mockGetLeagueJoinRequests.mockResolvedValue(MOCK_JOIN_REQUESTS_WITH_PENDING);

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(screen.queryByTestId('join-request-row-5')).toBeNull();
  });

  it('shows join request row for admin role', async () => {
    mockGetLeagueJoinRequests.mockResolvedValue(MOCK_JOIN_REQUESTS_WITH_PENDING);

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('join-request-row-5')).toBeTruthy();
      expect(screen.getByText('Alex Tran')).toBeTruthy();
    });
  });

  it('calls approveJoinRequest when Approve is pressed', async () => {
    mockGetLeagueJoinRequests.mockResolvedValue(MOCK_JOIN_REQUESTS_WITH_PENDING);

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('approve-request-btn-5')).toBeTruthy());
    fireEvent.press(screen.getByTestId('approve-request-btn-5'));

    await waitFor(() => {
      expect(mockApproveJoinRequest).toHaveBeenCalledWith(1, 5);
    });
  });

  it('calls rejectJoinRequest when Deny is pressed', async () => {
    mockGetLeagueJoinRequests.mockResolvedValue(MOCK_JOIN_REQUESTS_WITH_PENDING);

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('deny-request-btn-5')).toBeTruthy());
    fireEvent.press(screen.getByTestId('deny-request-btn-5'));

    await waitFor(() => {
      expect(mockRejectJoinRequest).toHaveBeenCalledWith(1, 5);
    });
  });
});

// ---------------------------------------------------------------------------
// Leave league
// ---------------------------------------------------------------------------

describe('LeagueInfoTab — leave league', () => {
  it('shows Leave League button for member role', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('leave-league-button')).toBeTruthy();
    });
  });

  it('does not show Leave League button for admin role', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(screen.queryByTestId('leave-league-button')).toBeNull();
  });

  it('calls leaveLeague after confirming the Alert', async () => {
    jest.spyOn(Alert, 'alert');

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('leave-league-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('leave-league-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave League',
      expect.any(String),
      expect.any(Array),
    );

    // Simulate pressing the destructive "Leave" button in the alert
    const alertArgs = jest.mocked(Alert.alert).mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const leaveBtn = buttons.find((b) => b.text === 'Leave');
    await leaveBtn?.onPress?.();

    await waitFor(() => {
      expect(mockLeaveLeague).toHaveBeenCalledWith(1);
    });
  });
});
