/**
 * Tests for PlayerStatsGrid.
 *
 * Covers:
 *  - Public player: stat tiles (win rate, record, games, ELO) are rendered.
 *  - Private player (game_history_visible=false): Win-rate and W-L record tiles
 *    are replaced by per-tile private placeholders (lock icon + "Private");
 *    Games and ELO tiles remain visible so the section stays meaningful.
 *  - Public player with null rating: ELO tile is omitted.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Player } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// usePaletteColors reads from ThemeContext — stub it so the component can
// render without a full provider tree.
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textMuted: '#888888',
    textDefault: '#111111',
  }),
}));

// ---------------------------------------------------------------------------
// Module under test (imported AFTER mocks)
// ---------------------------------------------------------------------------

import PlayerStatsGrid from '@/components/screens/PlayerProfile/PlayerStatsGrid';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_PLAYER: Player = {
  id: 1,
  name: 'Alice Smith',
  wins: 30,
  losses: 20,
  total_games: 50,
  current_rating: 1340,
  game_history_visible: true,
  profile_is_private: false,
};

/** Private player — ELO rating is still available (backend always returns it). */
const PRIVATE_PLAYER: Player = {
  id: 2,
  name: 'Bob Jones',
  wins: null,
  losses: null,
  total_games: 10,
  current_rating: 1200,
  game_history_visible: false,
  profile_is_private: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayerStatsGrid', () => {
  describe('public player (game_history_visible=true)', () => {
    it('renders the win-rate hero tile', () => {
      render(<PlayerStatsGrid player={PUBLIC_PLAYER} />);
      expect(screen.getByTestId('stat-win-rate')).toBeTruthy();
    });

    it('renders the W-L record tile', () => {
      render(<PlayerStatsGrid player={PUBLIC_PLAYER} />);
      expect(screen.getByTestId('stat-record')).toBeTruthy();
    });

    it('renders the games tile', () => {
      render(<PlayerStatsGrid player={PUBLIC_PLAYER} />);
      expect(screen.getByTestId('stat-games')).toBeTruthy();
    });

    it('renders the ELO rating tile when current_rating is non-null', () => {
      render(<PlayerStatsGrid player={PUBLIC_PLAYER} />);
      expect(screen.getByTestId('stat-rating')).toBeTruthy();
    });

    it('omits the ELO rating tile when current_rating is null', () => {
      render(<PlayerStatsGrid player={{ ...PUBLIC_PLAYER, current_rating: null }} />);
      expect(screen.queryByTestId('stat-rating')).toBeNull();
    });

    it('does NOT render private placeholders for a public player', () => {
      render(<PlayerStatsGrid player={PUBLIC_PLAYER} />);
      expect(screen.queryByTestId('stat-win-rate-private')).toBeNull();
      expect(screen.queryByTestId('stat-record-private')).toBeNull();
    });
  });

  describe('private player (game_history_visible=false)', () => {
    it('renders a private placeholder in place of the win-rate hero tile', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.getByTestId('stat-win-rate-private')).toBeTruthy();
    });

    it('renders a private placeholder in place of the W-L record tile', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.getByTestId('stat-record-private')).toBeTruthy();
    });

    it('does NOT render the public win-rate hero tile', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.queryByTestId('stat-win-rate')).toBeNull();
    });

    it('does NOT render the public W-L record tile', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.queryByTestId('stat-record')).toBeNull();
    });

    it('still renders the games tile for a private player', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.getByTestId('stat-games')).toBeTruthy();
    });

    it('still renders the ELO rating tile for a private player (rating is always shown)', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.getByTestId('stat-rating')).toBeTruthy();
    });

    it('does NOT render a full-screen private-notice overlay', () => {
      render(<PlayerStatsGrid player={PRIVATE_PLAYER} />);
      expect(screen.queryByTestId('stats-private-notice')).toBeNull();
    });
  });
});
