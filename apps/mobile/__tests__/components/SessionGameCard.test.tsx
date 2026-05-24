/**
 * Tests for SessionGameCard — "You" substitution and rendering.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@beach-kings/shared/tokens', () => ({
  colors: { primary: '#1a3a4a' },
  lightPalette: {
    bgSurface: '#ffffff',
    textDefault: '#1a1a1a',
    textMuted: '#666666',
    borderDivider: '#e5e7eb',
    success: '#16a34a',
    danger: '#dc2626',
    successTint: '#dcfce7',
    dangerTint: '#fee2e2',
    brandTeal: '#0D9488',
  },
  darkPalette: {
    bgSurface: '#1c2333',
    textDefault: '#e6edf3',
    textMuted: '#8b949e',
    borderDivider: '#21262d',
    success: '#4ade80',
    danger: '#f87171',
    successTint: '#14532d',
    dangerTint: '#7f1d1d',
    brandTeal: '#14b8a6',
  },
  darkColors: { brandTeal: '#14b8a6' },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, colorScheme: 'light' }),
}));

import SessionGameCard from '@/components/screens/Sessions/SessionGameCard';
import type { SessionGame } from '@beach-kings/shared';

const baseGame: SessionGame = {
  id: 1,
  game_number: 1,
  team1_player1_id: 10,
  team1_player2_id: 20,
  team2_player1_id: 30,
  team2_player2_id: 40,
  team1_player1_name: 'Patrick Schwagler',
  team1_player2_name: 'Alex Chen',
  team2_player1_name: 'Sam Torres',
  team2_player2_name: 'Jordan Lee',
  team1_score: 15,
  team2_score: 12,
  winner: 1,
  rating_change: 4.2,
  is_ranked: true,
};

describe('SessionGameCard — "You" substitution', () => {
  it('shows full names when currentPlayerName is null', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={1}
        currentPlayerName={null}
      />,
    );
    expect(screen.getByText('Patrick Schwagler / Alex Chen')).toBeTruthy();
  });

  it('replaces team1 player1 name with "You" when matched', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={1}
        currentPlayerName="Patrick Schwagler"
      />,
    );
    expect(screen.getByText('You / Alex Chen')).toBeTruthy();
    expect(screen.queryByText('Patrick Schwagler / Alex Chen')).toBeNull();
  });

  it('replaces team1 player2 name with "You" when matched', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={1}
        currentPlayerName="Alex Chen"
      />,
    );
    expect(screen.getByText('Patrick Schwagler / You')).toBeTruthy();
  });

  it('replaces team2 player1 name with "You" when matched', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={2}
        currentPlayerName="Sam Torres"
      />,
    );
    expect(screen.getByText('You / Jordan Lee')).toBeTruthy();
  });

  it('replaces team2 player2 name with "You" when matched', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={2}
        currentPlayerName="Jordan Lee"
      />,
    );
    expect(screen.getByText('Sam Torres / You')).toBeTruthy();
  });

  it('matches case-insensitively', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={1}
        currentPlayerName="patrick schwagler"
      />,
    );
    expect(screen.getByText('You / Alex Chen')).toBeTruthy();
  });

  it('does not replace when name does not match any player', () => {
    render(
      <SessionGameCard
        game={baseGame}
        userTeam={null}
        currentPlayerName="Someone Else"
      />,
    );
    expect(screen.getByText('Patrick Schwagler / Alex Chen')).toBeTruthy();
    expect(screen.getByText('Sam Torres / Jordan Lee')).toBeTruthy();
  });

  it('shows WIN badge when userTeam wins', () => {
    render(
      <SessionGameCard game={baseGame} userTeam={1} currentPlayerName={null} />,
    );
    expect(screen.getByText('WIN')).toBeTruthy();
  });

  it('shows LOSS badge when userTeam loses', () => {
    render(
      <SessionGameCard game={baseGame} userTeam={2} currentPlayerName={null} />,
    );
    expect(screen.getByText('LOSS')).toBeTruthy();
  });

  it('shows no WIN/LOSS badge when userTeam is null', () => {
    render(
      <SessionGameCard game={baseGame} userTeam={null} currentPlayerName={null} />,
    );
    expect(screen.queryByText('WIN')).toBeNull();
    expect(screen.queryByText('LOSS')).toBeNull();
  });
});
