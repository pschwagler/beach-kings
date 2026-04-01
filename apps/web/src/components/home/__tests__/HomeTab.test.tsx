/**
 * HomeTab — unit tests.
 *
 * Covers:
 * - "Games Played (Last 30 days)" stat card renders with the Swords icon
 * - "Total Games Played" stat card still renders with the Target icon
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../../services/api', () => ({
  getPlayerMatchHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../dashboard/MyLeaguesBar', () => ({
  default: () => <div data-testid="my-leagues-bar" />,
}));
vi.mock('../../dashboard/MyMatchesWidget', () => ({
  default: () => <div data-testid="my-matches-widget" />,
}));
vi.mock('../OpenSessionsList', () => ({
  MySessionsWidget: () => <div data-testid="my-sessions-widget" />,
}));
vi.mock('../NearYouSection', () => ({
  default: () => <div data-testid="near-you-section" />,
}));

// Mock lucide-react to expose icon names in rendered output
vi.mock('lucide-react', () => ({
  Users: () => <svg data-testid="icon-Users" />,
  TrendingUp: () => <svg data-testid="icon-TrendingUp" />,
  Target: () => <svg data-testid="icon-Target" />,
  Award: () => <svg data-testid="icon-Award" />,
  Swords: () => <svg data-testid="icon-Swords" />,
}));

vi.mock('../../../utils/avatar', () => ({
  isImageUrl: () => false,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import HomeTab from '../HomeTab';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const defaultProps = {
  currentUserPlayer: null,
  userLeagues: [],
  onTabChange: vi.fn(),
  onLeaguesUpdate: vi.fn(),
};

describe('HomeTab — stat card icons', () => {
  it('renders the Swords icon for the "Games Played (Last 30 days)" stat card', () => {
    render(<HomeTab {...defaultProps} />);
    expect(screen.getByTestId('icon-Swords')).toBeInTheDocument();
  });

  it('still renders the Target icon for the "Total Games Played" stat card', () => {
    render(<HomeTab {...defaultProps} />);
    expect(screen.getByTestId('icon-Target')).toBeInTheDocument();
  });

  it('does not render a second Target icon (no duplicates)', () => {
    render(<HomeTab {...defaultProps} />);
    // Only one Target icon — for "Total Games Played"
    const targetIcons = screen.getAllByTestId('icon-Target');
    expect(targetIcons).toHaveLength(1);
  });
});
