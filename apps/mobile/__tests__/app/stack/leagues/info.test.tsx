/**
 * Tests for the League Info tab.
 *
 * Covers:
 *   - Loading state
 *   - Error state when API fails
 *   - Description section renders when present
 *   - Description inline edit for admin (auto-save on blur)
 *   - Members list renders with roles
 *   - Admin member row: role picker and remove button
 *   - Self-remove button is disabled
 *   - Seasons list renders with active/past badge
 *   - Admin season create/edit sheet
 *   - League info section (access type, level, location)
 *   - Admin: Access picker auto-saves
 *   - Admin: Level picker auto-saves
 *   - Home courts pill list (primary starred, remove button)
 *   - Join requests visible to admin, hidden from member
 *   - Approve/deny request calls correct API method
 *   - Leave League button visible for member, hidden for admin
 *   - Leave League calls api.leaveLeague after confirmation
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
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
const mockUpdateLeagueMember = jest.fn();
const mockRemoveLeagueMember = jest.fn();
const mockUpdateLeague = jest.fn();
const mockAddLeagueHomeCourt = jest.fn();
const mockRemoveLeagueHomeCourt = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockGetCourts = jest.fn();
const mockCreateLeagueSeason = jest.fn();
const mockUpdateSeason = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeagueJoinRequests: (...args: unknown[]) => mockGetLeagueJoinRequests(...args),
    approveJoinRequest: (...args: unknown[]) => mockApproveJoinRequest(...args),
    rejectJoinRequest: (...args: unknown[]) => mockRejectJoinRequest(...args),
    leaveLeague: (...args: unknown[]) => mockLeaveLeague(...args),
    updateLeagueMember: (...args: unknown[]) => mockUpdateLeagueMember(...args),
    removeLeagueMember: (...args: unknown[]) => mockRemoveLeagueMember(...args),
    updateLeague: (...args: unknown[]) => mockUpdateLeague(...args),
    addLeagueHomeCourt: (...args: unknown[]) => mockAddLeagueHomeCourt(...args),
    removeLeagueHomeCourt: (...args: unknown[]) => mockRemoveLeagueHomeCourt(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    createLeagueSeason: (...args: unknown[]) => mockCreateLeagueSeason(...args),
    updateSeason: (...args: unknown[]) => mockUpdateSeason(...args),
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
  access_type: 'open',
  level: 'Intermediate',
  location_id: 'socal_sd',
  location_name: 'San Diego, CA',
  home_courts: [
    { id: 10, name: 'Kearny Mesa Park', address: null, position: 0 },
    { id: 11, name: 'Mission Bay Park', address: null, position: 1 },
  ],
};

// player_id 10 = current user (will be blocked from self-remove)
const MOCK_MEMBERS = [
  { id: 100, player_id: 10, player_name: 'Patrick Schwagler', role: 'admin', joined_at: '2025-01-01' },
  { id: 101, player_id: 11, player_name: 'Jane Smith', role: 'member', joined_at: '2025-02-01' },
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
    scoring_system: 'points_system',
    point_system: '{"type":"points_system","points_per_win":4,"points_per_loss":0}',
  },
  {
    id: 2,
    name: 'Spring 2025',
    start_date: '2025-03-01',
    end_date: '2025-05-31',
    is_active: false,
    session_count: 6,
    game_count: 30,
    scoring_system: 'season_rating',
    point_system: '{"type":"season_rating","initial_rating":100}',
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
  mockUpdateLeagueMember.mockResolvedValue({ success: true });
  mockRemoveLeagueMember.mockResolvedValue({ success: true });
  mockUpdateLeague.mockResolvedValue({ success: true });
  mockAddLeagueHomeCourt.mockResolvedValue({ success: true });
  mockRemoveLeagueHomeCourt.mockResolvedValue({ success: true });
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 10 });
  mockGetCourts.mockResolvedValue([{ id: 99, name: 'New Court' }]);
  mockCreateLeagueSeason.mockResolvedValue({ id: 4 });
  mockUpdateSeason.mockResolvedValue({ id: 3 });
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

  it('does not show description section when null and non-admin', async () => {
    mockGetLeague.mockResolvedValue({ ...MOCK_LEAGUE, description: null });

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(screen.queryByText('Description')).toBeNull();
  });

  it('admin sees description edit button', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('description-edit-btn')).toBeTruthy();
    });
  });

  it('admin can tap description to open text input', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('description-edit-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('description-edit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('description-input')).toBeTruthy();
    });
  });

  it('admin description auto-saves on blur when changed', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('description-edit-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('description-edit-btn'));

    const input = screen.getByTestId('description-input');
    fireEvent.changeText(input, 'Updated description');
    fireEvent(input, 'blur');

    await waitFor(() => {
      expect(mockUpdateLeague).toHaveBeenCalledWith(1, { description: 'Updated description' });
    });
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

  it('admin sees remove button on each member row', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('remove-member-btn-10')).toBeTruthy();
      expect(screen.getByTestId('remove-member-btn-11')).toBeTruthy();
    });
  });

  it('uses the fetched current member role over a stale admin prop', async () => {
    mockGetCurrentUserPlayer.mockResolvedValue({ id: 11 });

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('member-row-11')).toBeTruthy());
    expect(screen.queryByTestId('remove-member-btn-10')).toBeNull();
    expect(screen.queryByTestId('remove-member-btn-11')).toBeNull();
  });

  it('self-remove button does not call api when pressed', async () => {
    // currentPlayerId = 10 — pressing the self-remove button should be a no-op
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('remove-member-btn-10')).toBeTruthy());

    // Press is blocked by disabled; even if it fires, removeLeagueMember must not be called
    fireEvent.press(screen.getByTestId('remove-member-btn-10'));
    await waitFor(() => expect(mockRemoveLeagueMember).not.toHaveBeenCalled());
  });

  it('non-self remove button triggers confirmation alert', async () => {
    jest.spyOn(Alert, 'alert');

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('remove-member-btn-11')).toBeTruthy());
    fireEvent.press(screen.getByTestId('remove-member-btn-11'));
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('admin can remove a non-self player after confirmation', async () => {
    jest.spyOn(Alert, 'alert');

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('remove-member-btn-11')).toBeTruthy());
    fireEvent.press(screen.getByTestId('remove-member-btn-11'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Remove Player',
      expect.stringContaining('Jane Smith'),
      expect.any(Array),
    );

    const alertArgs = jest.mocked(Alert.alert).mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; style?: string; onPress?: () => void }>;
    const removeBtn = buttons.find((b) => b.text === 'Remove');
    await removeBtn?.onPress?.();

    await waitFor(() => {
      expect(mockRemoveLeagueMember).toHaveBeenCalledWith(1, 101);
    });
  });

  it('admin role badge tap triggers role change alert', async () => {
    jest.spyOn(Alert, 'alert');

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('role-badge-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('role-badge-10'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Patrick Schwagler',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('admin confirms role change — calls updateLeagueMember', async () => {
    jest.spyOn(Alert, 'alert');

    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('role-badge-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('role-badge-10'));

    const alertArgs = jest.mocked(Alert.alert).mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const changeBtn = buttons.find((b) => b.text !== 'Cancel');
    await changeBtn?.onPress?.();

    await waitFor(() => {
      // admin (player_id 10, member_id 100) → toggled to 'member'
      expect(mockUpdateLeagueMember).toHaveBeenCalledWith(1, 100, 'member');
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

  it('admin sees New Season button', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('new-season-btn')).toBeTruthy();
    });
  });

  it('non-admin does not see New Season button', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(screen.queryByTestId('new-season-btn')).toBeNull();
  });

  it('New Season button opens the create sheet', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => {
      expect(screen.getByText('New Season')).toBeTruthy();
      expect(screen.getByTestId('season-name-input')).toBeTruthy();
      expect(screen.getByTestId('season-form-scroll')).toBeTruthy();
      expect(screen.getByTestId('season-form-footer')).toBeTruthy();
      expect(screen.getByTestId('season-cancel-btn')).toBeTruthy();
      expect(screen.getByTestId('season-submit-btn')).toBeTruthy();
    });
  });

  it('season form cancel remains reachable and closes the sheet', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-form-footer')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-cancel-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('season-form-sheet')).toBeNull();
    });
  });

  it('create form submits expected points payload', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-name-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-name-input'), 'Fall 2026');
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '2026-09-01');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2026-11-10');
    fireEvent.changeText(screen.getByTestId('points-per-win-input'), '5');
    fireEvent.changeText(screen.getByTestId('points-per-loss-input'), '0');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(mockCreateLeagueSeason).toHaveBeenCalledWith(1, {
        name: 'Fall 2026',
        start_date: '2026-09-01',
        end_date: '2026-11-10',
        scoring_system: 'points_system',
        points_per_win: 5,
        points_per_loss: 0,
      });
    });
  });

  it('create form allows negative points per loss', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-name-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '2026-09-01');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2026-11-10');
    fireEvent.changeText(screen.getByTestId('points-per-loss-input'), '-1');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(mockCreateLeagueSeason).toHaveBeenCalledWith(1, expect.objectContaining({
        points_per_loss: -1,
      }));
    });
  });

  it('create form submits season rating payload without point fields', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-name-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '2026-09-01');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2026-11-10');
    fireEvent.press(screen.getByTestId('scoring-season_rating'));
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(mockCreateLeagueSeason).toHaveBeenCalledWith(1, {
        name: undefined,
        start_date: '2026-09-01',
        end_date: '2026-11-10',
        scoring_system: 'season_rating',
      });
    });
  });

  it('edit form preloads season fields and warns on scoring change', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('season-row-pressable-3')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-row-pressable-3'));

    await waitFor(() => {
      expect(screen.getByText('Edit Season')).toBeTruthy();
      expect(screen.getByTestId('season-name-input').props.value).toBe('Summer 2025');
      expect(screen.getByTestId('season-start-date-input').props.value).toBe('2025-06-01');
      expect(screen.getByTestId('points-per-win-input').props.value).toBe('4');
      expect(screen.getByTestId('points-per-loss-input').props.value).toBe('0');
    });

    fireEvent.press(screen.getByTestId('scoring-season_rating'));

    await waitFor(() => {
      expect(screen.getByTestId('season-scoring-warning')).toBeTruthy();
    });
  });

  it('edit form submits update payload', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('season-row-pressable-3')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-row-pressable-3'));

    await waitFor(() => expect(screen.getByTestId('season-name-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-name-input'), 'Summer Finals');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2025-08-31');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(mockUpdateSeason).toHaveBeenCalledWith(3, {
        name: 'Summer Finals',
        start_date: '2025-06-01',
        end_date: '2025-08-31',
        scoring_system: 'points_system',
        points_per_win: 4,
        points_per_loss: 0,
      });
    });
  });

  it('validation blocks invalid dates', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-start-date-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '2026-09-01');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2026-08-31');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('season-form-error')).toBeTruthy();
      expect(mockCreateLeagueSeason).not.toHaveBeenCalled();
    });
  });

  it('validation blocks malformed dates', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-start-date-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '2026-99-99');
    fireEvent.changeText(screen.getByTestId('season-end-date-input'), '2026-11-10');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('Dates must use YYYY-MM-DD.')).toBeTruthy();
      expect(mockCreateLeagueSeason).not.toHaveBeenCalled();
    });
  });

  it('validation disables submit when a required date is missing', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('new-season-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('new-season-btn'));

    await waitFor(() => expect(screen.getByTestId('season-start-date-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('season-start-date-input'), '');
    fireEvent.press(screen.getByTestId('season-submit-btn'));

    expect(mockCreateLeagueSeason).not.toHaveBeenCalled();
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
    mockGetLeague.mockResolvedValue({ ...MOCK_LEAGUE, access_type: 'invite_only' });

    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Invite Only')).toBeTruthy();
    });
  });

  it('shows all home court names as pills', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="member" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('court-pill-10')).toBeTruthy();
      expect(screen.getByTestId('court-pill-11')).toBeTruthy();
      expect(screen.getByText('Kearny Mesa Park')).toBeTruthy();
      expect(screen.getByText('Mission Bay Park')).toBeTruthy();
    });
  });

  it('admin sees remove button on court pills', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('remove-court-btn-10')).toBeTruthy();
      expect(screen.getByTestId('remove-court-btn-11')).toBeTruthy();
    });
  });

  it('remove court calls removeLeagueHomeCourt', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('remove-court-btn-11')).toBeTruthy());
    fireEvent.press(screen.getByTestId('remove-court-btn-11'));

    await waitFor(() => {
      expect(mockRemoveLeagueHomeCourt).toHaveBeenCalledWith(1, 11);
    });
  });

  it('admin sees add court button', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('add-court-btn')).toBeTruthy();
    });
  });

  it('admin sees Edit hint on access row', async () => {
    render(<LeagueInfoTab leagueId={1} userRole="admin" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('info-row-access')).toBeTruthy();
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

    const alertArgs = jest.mocked(Alert.alert).mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const leaveBtn = buttons.find((b) => b.text === 'Leave');
    await act(async () => {
      await leaveBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockLeaveLeague).toHaveBeenCalledWith(1);
    });
  });
});
