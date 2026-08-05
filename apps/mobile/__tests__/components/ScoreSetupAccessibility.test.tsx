import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textMuted: '#596568',
    textTertiary: '#697577',
    textInverse: '#fffdf8',
  }),
}));

jest.mock('@/components/ui/Avatar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ name }: { readonly name: string }) => <View accessibilityLabel={name} />;
});

import ScoreBoard from '@/components/screens/Games/ScoreBoard';
import RosterPicker from '@/components/screens/Games/RosterPicker';
import type { PlayerSlot, RosterPlayer } from '@/components/screens/Games/useScoreGameScreen';

const EMPTY_SLOT: PlayerSlot = {
  player_id: null,
  display_name: '',
  initials: '',
  avatar_url: null,
  is_guest: false,
};

const EMPTY_TEAM = [EMPTY_SLOT, EMPTY_SLOT] as const;

describe('score setup accessibility', () => {
  it('names the active slot and gives every empty slot a unique label', () => {
    render(
      <ScoreBoard
        team1Slots={EMPTY_TEAM}
        team2Slots={EMPTY_TEAM}
        score1={0}
        score2={0}
        isBuilding
        activeSlot={{ team: 1, slot: 0 }}
      />,
    );

    expect(screen.getByTestId('active-slot-label')).toHaveTextContent(
      'Choose Team 1 player 1',
    );
    expect(screen.getByLabelText('Add Team 1 player 1')).toBeTruthy();
    expect(screen.getByLabelText('Add Team 1 player 2')).toBeTruthy();
    expect(screen.getByLabelText('Add Team 2 player 1')).toBeTruthy();
    expect(screen.getByLabelText('Add Team 2 player 2')).toBeTruthy();
  });

  it('announces slot changes without claiming a player was added', () => {
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(jest.fn());
    const { rerender } = render(
      <ScoreBoard
        team1Slots={EMPTY_TEAM}
        team2Slots={EMPTY_TEAM}
        score1={0}
        score2={0}
        isBuilding
        activeSlot={{ team: 1, slot: 0 }}
      />,
    );

    rerender(
      <ScoreBoard
        team1Slots={EMPTY_TEAM}
        team2Slots={EMPTY_TEAM}
        score1={0}
        score2={0}
        isBuilding
        activeSlot={{ team: 2, slot: 0 }}
      />,
    );

    expect(announceSpy).toHaveBeenCalledWith('Choose Team 2 player 1');
    expect(announceSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Player added'),
    );
    announceSpy.mockRestore();
  });

  it('shows only the strongest relationship signal on a player row', () => {
    const player: RosterPlayer = {
      player_id: 42,
      display_name: 'Taylor Beach',
      initials: 'TB',
      avatar_url: null,
      is_guest: false,
      isSession: false,
      tags: ['in_league', 'shared_league', 'friend', 'recent_opp'],
    };

    render(
      <RosterPicker
        roster={[player]}
        team1={EMPTY_TEAM}
        team2={EMPTY_TEAM}
        search=""
        onSearch={jest.fn()}
        onSelectPlayer={jest.fn()}
      />,
    );

    expect(screen.getByTestId('roster-pill-in_league')).toBeTruthy();
    expect(screen.queryByTestId('roster-pill-shared_league')).toBeNull();
    expect(screen.queryByTestId('roster-pill-friend')).toBeNull();
    expect(screen.queryByTestId('roster-pill-recent_opp')).toBeNull();
    expect(screen.getByLabelText('Add Taylor Beach').props.className).toContain(
      'min-h-touch',
    );
  });
});
