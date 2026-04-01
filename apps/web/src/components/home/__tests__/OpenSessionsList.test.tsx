/**
 * OpenSessionsList (MySessionsWidget) — unit tests.
 *
 * Regression guard for the routing bug where league sessions routed to the
 * league page instead of the session page.
 *
 * Expected behaviour: clicking any session card — regardless of whether the
 * session has a league_id — navigates to `/session/{code}`.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('../../../services/api', () => ({
  getOpenSessions: vi.fn(),
}));

vi.mock('../../../utils/dateUtils', () => ({
  formatDate: vi.fn((d: string) => d),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getOpenSessions } from '../../../services/api';
import { MySessionsWidget } from '../OpenSessionsList';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Session',
    date: '2025-01-01',
    status: 'OPEN',
    code: 'ABC123',
    league_id: null,
    league_name: null,
    season_id: null,
    court_name: null,
    court_slug: null,
    created_by: null,
    created_by_name: null,
    participation: 'player',
    match_count: 3,
    user_match_count: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MySessionsWidget — session click navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it('navigates to /session/{code} for a pickup session', async () => {
    (getOpenSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSession({ code: 'PICKUP1', league_id: null }),
    ]);

    render(<MySessionsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Session'));

    expect(mockPush).toHaveBeenCalledWith('/session/PICKUP1');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/league/'),
    );
  });

  it('navigates to /session/{code} for a league session (not to the league page)', async () => {
    (getOpenSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSession({ code: 'LEAGUE1', league_id: 42, season_id: 7 }),
    ]);

    render(<MySessionsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Session'));

    expect(mockPush).toHaveBeenCalledWith('/session/LEAGUE1');
    // Must NOT route to the league page
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining('/league/42'),
    );
  });

  it('does not navigate when session has no code', async () => {
    (getOpenSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSession({ code: null, league_id: null }),
    ]);

    render(<MySessionsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Session'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls onSessionClick callback instead of router when provided', async () => {
    const onSessionClick = vi.fn();
    const session = makeSession({ code: 'CB1', league_id: 5 });

    (getOpenSessions as ReturnType<typeof vi.fn>).mockResolvedValue([session]);

    render(<MySessionsWidget onSessionClick={onSessionClick} />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Session'));

    expect(onSessionClick).toHaveBeenCalledWith(expect.objectContaining({ code: 'CB1' }));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
