/**
 * Unit tests for FindLeaguesPage.
 *
 * Covers:
 * - showJoinedLeagues initialises to true (default: include joined leagues)
 * - The toggle label reads "Hide joined leagues" (matching the new default)
 * - Toggling the checkbox flips the state
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the component under test
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../services/api', () => ({
  queryLeagues: vi.fn().mockResolvedValue({ items: [], total_count: 0 }),
  joinLeague: vi.fn(),
  requestToJoinLeague: vi.fn(),
  cancelJoinRequest: vi.fn(),
  getUserLeagues: vi.fn().mockResolvedValue([]),
  getLocations: vi.fn().mockResolvedValue([]),
  createLeague: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, email: 'test@example.com' },
    currentUserPlayer: { id: 1, name: 'Test Player' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}));

vi.mock('../../../contexts/AuthModalContext', () => ({
  useAuthModal: vi.fn(() => ({
    openAuthModal: vi.fn(),
  })),
}));

vi.mock('../../../contexts/ModalContext', () => ({
  useModal: vi.fn(() => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
  })),
  MODAL_TYPES: {
    CREATE_LEAGUE: 'CREATE_LEAGUE',
  },
}));

vi.mock('../../layout/NavBar', () => ({
  default: () => <nav data-testid="navbar" />,
}));

vi.mock('../../home/HomeMenuBar', () => ({
  default: () => <div data-testid="home-menu-bar" />,
}));

vi.mock('../../ui/FilterableTable', () => ({
  default: ({
    extraFiltersContent,
    emptyMessage,
    data,
  }: {
    extraFiltersContent?: React.ReactNode;
    emptyMessage?: string;
    data?: unknown[];
  }) => (
    <div data-testid="filterable-table">
      {extraFiltersContent}
      {Array.isArray(data) && data.length === 0 && emptyMessage && (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  ),
}));

vi.mock('../../ui/LevelBadge', () => ({
  default: () => <span />,
}));

// ---------------------------------------------------------------------------
// Import component after mocks are in place
// ---------------------------------------------------------------------------

import FindLeaguesPage from '../FindLeaguesPage';

describe('FindLeaguesPage', () => {
  it('renders the joined-leagues toggle with checked=true by default', () => {
    render(<FindLeaguesPage />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('renders the toggle label as "Hide joined leagues"', () => {
    render(<FindLeaguesPage />);

    expect(screen.getByText('Hide joined leagues')).toBeInTheDocument();
  });

  it('unchecks the checkbox when clicked (toggling hides joined leagues)', async () => {
    render(<FindLeaguesPage />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('shows "Try adjusting your filter" text in empty state when leagues is empty', async () => {
    render(<FindLeaguesPage />);

    // queryLeagues mock returns { items: [], total_count: 0 } so data=[],
    // the FilterableTable mock renders the emptyMessage paragraph.
    expect(
      await screen.findByText(/Try adjusting your filter/i)
    ).toBeInTheDocument();
  });
});
