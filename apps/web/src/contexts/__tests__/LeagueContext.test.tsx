import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('../../services/api', () => ({
  getLeague: vi.fn(),
  getLeagueSeasons: vi.fn(),
  getLeagueMembers: vi.fn(),
  getRankings: vi.fn(),
  getSeasonMatches: vi.fn(),
  getMatchesWithElo: vi.fn(),
  getAllPlayerSeasonStats: vi.fn(),
  getAllSeasonPartnershipOpponentStats: vi.fn(),
  getAllPlayerStats: vi.fn(),
  getAllPartnershipOpponentStats: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../components/league/utils/playerDataUtils', () => ({
  transformPlayerData: vi.fn(() => ({ stats: {}, matchHistory: [] })),
}));

import {
  getLeague,
  getLeagueSeasons,
  getLeagueMembers,
  getRankings,
  getSeasonMatches,
  getMatchesWithElo,
  getAllPlayerSeasonStats,
  getAllSeasonPartnershipOpponentStats,
  getAllPlayerStats,
  getAllPartnershipOpponentStats,
} from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { LeagueProvider, useLeague } from '../LeagueContext';

const mockLeague = { id: 1, name: 'Test League' };
const mockSeasons = [
  { id: 10, name: 'Spring 2024', start_date: '2024-03-01', end_date: '2024-06-30' },
  { id: 11, name: 'Summer 2024', start_date: '2024-07-01', end_date: '2024-09-30' },
];
const mockMembers = [
  { id: 1, player_id: 42, role: 'admin' },
  { id: 2, player_id: 99, role: 'member' },
];

function setupDefaultMocks() {
  useAuth.mockReturnValue({
    currentUserPlayer: null,
    isInitializing: false,
  });
  getLeague.mockResolvedValue(mockLeague);
  getLeagueSeasons.mockResolvedValue(mockSeasons);
  getLeagueMembers.mockResolvedValue(mockMembers);
  getRankings.mockResolvedValue([]);
  getSeasonMatches.mockResolvedValue([]);
  getMatchesWithElo.mockResolvedValue([]);
  getAllPlayerSeasonStats.mockResolvedValue({});
  getAllSeasonPartnershipOpponentStats.mockResolvedValue({});
  getAllPlayerStats.mockResolvedValue({});
  getAllPartnershipOpponentStats.mockResolvedValue({});
}

/** Consumer component that exposes context values via data-testids. */
function LeagueConsumer() {
  const ctx = useLeague();
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="error">{ctx.error ?? 'null'}</span>
      <span data-testid="league-name">{ctx.league?.name ?? 'null'}</span>
      <span data-testid="seasons-count">{ctx.seasons.length}</span>
    </div>
  );
}

describe('LeagueProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('loading state transitions', () => {
    it('starts in loading state then settles after data loads', async () => {
      render(
        <LeagueProvider leagueId={1}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('league-name').textContent).toBe('Test League');
    });

    it('remains loading while auth is initializing', () => {
      useAuth.mockReturnValue({
        currentUserPlayer: null,
        isInitializing: true,
      });

      render(
        <LeagueProvider leagueId={1}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      // During auth init the effect is skipped, so loading stays true
      expect(screen.getByTestId('loading').textContent).toBe('true');
    });

    it('sets loading: false with no data when leagueId is not provided', async () => {
      render(
        <LeagueProvider leagueId={null}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('league-name').textContent).toBe('null');
    });
  });

  describe('error state', () => {
    it('sets error when getLeague call fails', async () => {
      getLeague.mockRejectedValue({
        response: { data: { detail: 'Not found' } },
      });

      render(
        <LeagueProvider leagueId={999}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('error').textContent).toBe('Not found');
    });

    it('falls back to generic error message when detail is missing', async () => {
      getLeague.mockRejectedValue(new Error('Network error'));

      render(
        <LeagueProvider leagueId={1}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Failed to load league');
      });
    });
  });

  describe('seasons loaded', () => {
    it('populates seasons from API response', async () => {
      render(
        <LeagueProvider leagueId={1}>
          <LeagueConsumer />
        </LeagueProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('seasons-count').textContent).toBe('2');
      });
    });
  });
});

describe('isSeasonActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function ActiveConsumer({ season }) {
    const { isSeasonActive } = useLeague();
    return <span data-testid="active">{String(isSeasonActive(season))}</span>;
  }

  it('returns true for a season whose dates span today', async () => {
    // Use far-future dates so the test never expires
    const activeSeason = {
      id: 1,
      start_date: '2020-01-01',
      end_date: '2099-12-31',
    };

    render(
      <LeagueProvider leagueId={1}>
        <ActiveConsumer season={activeSeason} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('true');
    });
  });

  it('returns false for a season that ended in the past', async () => {
    const pastSeason = {
      id: 2,
      start_date: '2000-01-01',
      end_date: '2000-06-30',
    };

    render(
      <LeagueProvider leagueId={1}>
        <ActiveConsumer season={pastSeason} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('false');
    });
  });

  it('returns false when season is null', async () => {
    render(
      <LeagueProvider leagueId={1}>
        <ActiveConsumer season={null} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('false');
    });
  });

  it('returns false when season is missing dates', async () => {
    render(
      <LeagueProvider leagueId={1}>
        <ActiveConsumer season={{ id: 1 }} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('false');
    });
  });
});

describe('isSeasonPast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function PastConsumer({ season }) {
    const { isSeasonPast } = useLeague();
    return <span data-testid="past">{String(isSeasonPast(season))}</span>;
  }

  it('returns true for a season that ended in the past', async () => {
    const pastSeason = {
      id: 1,
      end_date: '2000-01-01',
    };

    render(
      <LeagueProvider leagueId={1}>
        <PastConsumer season={pastSeason} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('past').textContent).toBe('true');
    });
  });

  it('returns false for a season ending in the future', async () => {
    const futureSeason = {
      id: 2,
      end_date: '2099-12-31',
    };

    render(
      <LeagueProvider leagueId={1}>
        <PastConsumer season={futureSeason} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('past').textContent).toBe('false');
    });
  });

  it('returns false for null season', async () => {
    render(
      <LeagueProvider leagueId={1}>
        <PastConsumer season={null} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('past').textContent).toBe('false');
    });
  });

  it('returns false when season has no end_date', async () => {
    render(
      <LeagueProvider leagueId={1}>
        <PastConsumer season={{ id: 1 }} />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('past').textContent).toBe('false');
    });
  });
});

describe('useLeague outside provider', () => {
  it('throws an error when used outside LeagueProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<LeagueConsumer />)).toThrow(
      'useLeague must be used within a LeagueProvider'
    );

    consoleError.mockRestore();
  });
});

describe('isLeagueMember and isLeagueAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function MembershipConsumer() {
    const { isLeagueMember, isLeagueAdmin } = useLeague();
    return (
      <div>
        <span data-testid="is-member">{String(isLeagueMember)}</span>
        <span data-testid="is-admin">{String(isLeagueAdmin)}</span>
      </div>
    );
  }

  it('returns isLeagueMember: true when currentUserPlayer is in members', async () => {
    useAuth.mockReturnValue({
      currentUserPlayer: { id: 99 },
      isInitializing: false,
    });

    render(
      <LeagueProvider leagueId={1}>
        <MembershipConsumer />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-member').textContent).toBe('true');
    });
  });

  it('returns isLeagueAdmin: true when currentUserPlayer has admin role', async () => {
    useAuth.mockReturnValue({
      currentUserPlayer: { id: 42 },
      isInitializing: false,
    });

    render(
      <LeagueProvider leagueId={1}>
        <MembershipConsumer />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-admin').textContent).toBe('true');
    });
  });

  it('returns isLeagueAdmin: false when currentUserPlayer is a non-admin member', async () => {
    useAuth.mockReturnValue({
      currentUserPlayer: { id: 99 },
      isInitializing: false,
    });

    render(
      <LeagueProvider leagueId={1}>
        <MembershipConsumer />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-admin').textContent).toBe('false');
    });
  });

  it('returns isLeagueMember: false when currentUserPlayer is null', async () => {
    useAuth.mockReturnValue({
      currentUserPlayer: null,
      isInitializing: false,
    });

    render(
      <LeagueProvider leagueId={1}>
        <MembershipConsumer />
      </LeagueProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-member').textContent).toBe('false');
    });
  });
});
