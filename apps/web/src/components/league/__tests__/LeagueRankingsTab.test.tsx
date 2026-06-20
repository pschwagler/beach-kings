/**
 * LeagueRankingsTab — zero-season "all-time view" tests.
 *
 * A league with zero seasons must NOT show a blocking wall. Instead it should
 * fall through to the normal render with selectedSeasonId = null, which
 * triggers the all-time (gap-game) rankings path.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockLoadAllSeasonsRankings = vi.fn();
const mockSetRankingsSeasonId = vi.fn();

vi.mock('../../../contexts/LeagueContext', () => ({
  useLeague: vi.fn(() => ({
    league: { id: 1, name: 'Test League' },
    leagueId: 1,
    seasons: [],
    members: [
      { player_id: 1, player_name: 'Alice' },
      { player_id: 2, player_name: 'Bob' },
      { player_id: 3, player_name: 'Carol' },
      { player_id: 4, player_name: 'Dave' },
    ],
    isSeasonActive: vi.fn(() => false),
    seasonData: {},
    seasonDataLoadingMap: {},
    loadSeasonData: vi.fn(),
    loadAllSeasonsRankings: mockLoadAllSeasonsRankings,
    rankingsSeasonId: null,
    setRankingsSeasonId: mockSetRankingsSeasonId,
    rankingsSeasonData: null,
    selectedPlayerId: null,
    selectedPlayerName: null,
    setSelectedPlayer: vi.fn(),
    refreshSeasons: vi.fn(),
    refreshMembers: vi.fn(),
  })),
  ALL_SEASONS_KEY: '__all__',
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    currentUserPlayer: { id: 1, name: 'Alice' },
  })),
}));

// Mock child components that require deep context
vi.mock('../../rankings/RankingsTable', () => ({
  default: ({ rankings, isAllSeasons, loading }: { rankings: unknown; isAllSeasons: boolean; loading: boolean }) => (
    <div
      data-testid="rankings-table"
      data-is-all-seasons={String(isAllSeasons)}
      data-loading={String(loading)}
      data-rankings-count={Array.isArray(rankings) ? rankings.length : 'null'}
    />
  ),
}));

vi.mock('../CreateSeasonModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="create-season-modal" data-open={String(isOpen)} />
  ),
}));

vi.mock('../AddPlayersModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="add-players-modal" data-open={String(isOpen)} />
  ),
}));

vi.mock('../hooks/usePlayerDetailsDrawer', () => ({
  usePlayerDetailsDrawer: vi.fn(() => ({
    handlePlayerClick: vi.fn(),
  })),
}));

vi.mock('../utils/matchUtils', () => ({
  buildPlaceholderIdSet: vi.fn(() => new Set<number>()),
}));

vi.mock('../utils/leagueUtils', () => ({
  formatDateRange: vi.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import LeagueRankingsTab from '../LeagueRankingsTab';
import { useLeague } from '../../../contexts/LeagueContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLeagueContext(overrides: Record<string, unknown> = {}) {
  return {
    league: { id: 1, name: 'Test League' },
    leagueId: 1,
    seasons: [],
    members: [
      { player_id: 1, player_name: 'Alice' },
      { player_id: 2, player_name: 'Bob' },
      { player_id: 3, player_name: 'Carol' },
      { player_id: 4, player_name: 'Dave' },
    ],
    isSeasonActive: vi.fn(() => false),
    seasonData: {},
    seasonDataLoadingMap: {},
    loadSeasonData: vi.fn(),
    loadAllSeasonsRankings: mockLoadAllSeasonsRankings,
    rankingsSeasonId: null,
    setRankingsSeasonId: mockSetRankingsSeasonId,
    rankingsSeasonData: null,
    selectedPlayerId: null,
    selectedPlayerName: null,
    setSelectedPlayer: vi.fn(),
    refreshSeasons: vi.fn(),
    refreshMembers: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeagueRankingsTab — zero-season league (gap-game all-time view)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useLeague as ReturnType<typeof vi.fn>).mockReturnValue(makeLeagueContext());
  });

  it('does NOT render the "No seasons found" blocking wall when seasons is empty', () => {
    render(<LeagueRankingsTab />);

    expect(screen.queryByText(/No seasons found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Please create a season to view rankings/i)).not.toBeInTheDocument();
  });

  it('renders the RankingsTable (all-time view) when seasons is empty', () => {
    render(<LeagueRankingsTab />);

    expect(screen.getByTestId('rankings-table')).toBeInTheDocument();
  });

  it('renders RankingsTable with isAllSeasons=true when no season is selected', () => {
    render(<LeagueRankingsTab />);

    const table = screen.getByTestId('rankings-table');
    expect(table).toHaveAttribute('data-is-all-seasons', 'true');
  });

  it('renders the season <select> with only the "All Seasons" option when seasons is empty', () => {
    render(<LeagueRankingsTab />);

    const select = screen.getByTestId('season-select');
    expect(select).toBeInTheDocument();
    // Only the "All Seasons" option — no season entries
    expect(select.querySelectorAll('option')).toHaveLength(1);
    expect(select.querySelector('option')?.textContent).toMatch(/All Seasons/i);
  });

  it('still shows the season <select> and Create Season affordance alongside rankings', () => {
    render(<LeagueRankingsTab />);

    // RankingsTable rendered (not a wall)
    expect(screen.getByTestId('rankings-table')).toBeInTheDocument();
    // CreateSeasonModal is mounted (available to open) even for zero-season leagues
    expect(screen.getByTestId('create-season-modal')).toBeInTheDocument();
  });

  it('renders normally when seasons has entries (regression guard)', () => {
    (useLeague as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLeagueContext({
        seasons: [{ id: 1, name: 'Season 1' }],
      })
    );

    render(<LeagueRankingsTab />);

    expect(screen.getByTestId('rankings-table')).toBeInTheDocument();
    // Season <select> should have 2 options: "All Seasons" + "Season 1"
    const select = screen.getByTestId('season-select');
    expect(select.querySelectorAll('option')).toHaveLength(2);
  });
});
