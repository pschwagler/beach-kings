import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import ScoreBoard from '@/components/screens/Games/ScoreBoard';
import RosterPicker from '@/components/screens/Games/RosterPicker';
import type { PlayerSlot, RosterPlayer } from '@/components/screens/Games/scoreGameModel';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ colorScheme: 'light', isDark: false }),
}));

const mockAvatarRender = jest.fn();
jest.mock('@/components/ui/Avatar', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { name: string }) => {
      mockAvatarRender(props.name);
      return <View accessibilityLabel={props.name} />;
    },
  };
});

const players: RosterPlayer[] = ['Alex Beach', 'Blair Beach', 'Casey Beach', 'Drew Beach'].map(
  (name, index) => ({
    player_id: index + 1,
    display_name: name,
    initials: name[0] + 'B',
    tags: [],
    isSession: index < 2,
  }),
);
const team1: [PlayerSlot, PlayerSlot] = [players[0]!, players[1]!];
const team2: [PlayerSlot, PlayerSlot] = [players[2]!, players[3]!];
const emptyTeam: [PlayerSlot, PlayerSlot] = [
  { player_id: null, display_name: '', initials: '' },
  { player_id: null, display_name: '', initials: '' },
];

afterEach(() => jest.restoreAllMocks());

it('updates scores without rerendering players or rebuilding drag gestures', () => {
  const gestures = jest.spyOn(Gesture, 'Pan');
  const onRemovePlayer = jest.fn();
  const props = { team1Slots: team1, team2Slots: team2, isBuilding: false, onRemovePlayer };
  const { rerender } = render(<ScoreBoard {...props} score1={0} score2={0} activeScoreTeam={1} />);
  mockAvatarRender.mockClear();
  gestures.mockClear();

  rerender(<ScoreBoard {...props} score1={2} score2={0} activeScoreTeam={1} />);
  rerender(<ScoreBoard {...props} score1={21} score2={0} activeScoreTeam={2} />);
  rerender(<ScoreBoard {...props} score1={21} score2={1} activeScoreTeam={2} />);
  rerender(<ScoreBoard {...props} score1={21} score2={19} activeScoreTeam={1} />);

  expect(mockAvatarRender).not.toHaveBeenCalled();
  expect(gestures).not.toHaveBeenCalled();
  expect(screen.getByTestId('score-display-team1')).toHaveTextContent('21');
  expect(screen.getByTestId('score-display-team2')).toHaveTextContent('19');
  fireEvent.press(screen.getByLabelText('Remove Alex Beach'));
  expect(onRemovePlayer).toHaveBeenCalledWith(1, 0);
});

it('does not rerender unchanged roster rows and chips while typing or selecting', () => {
  const onSelectPlayer = jest.fn();
  const props = { roster: players, team1: emptyTeam, team2: emptyTeam, onSearch: jest.fn(), onSelectPlayer };
  const { rerender } = render(<RosterPicker {...props} search="" />);
  mockAvatarRender.mockClear();

  rerender(<RosterPicker {...props} search="B" isSearching />);
  rerender(<RosterPicker {...props} search="Be" isSearching />);
  rerender(<RosterPicker {...props} search="Bea" isSearching />);
  rerender(<RosterPicker {...props} roster={players.slice(1)} team1={[players[0]!, emptyTeam[1]]} search="" />);

  expect(mockAvatarRender).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('roster-chip-2'));
  expect(onSelectPlayer).toHaveBeenCalledWith(players[1]);
});

it('only builds a gesture for the newly filled slot when adding the fourth player', () => {
  const gestures = jest.spyOn(Gesture, 'Pan');
  const props = { team1Slots: team1, score1: 0, score2: 0 };
  const { rerender } = render(
    <ScoreBoard
      {...props}
      team2Slots={[players[2]!, emptyTeam[1]]}
      isBuilding
      activeSlot={{ team: 2, slot: 1 }}
      onSwapSlots={jest.fn()}
    />,
  );
  gestures.mockClear();
  mockAvatarRender.mockClear();

  // The form's swap callback changes identity when its team arrays change.
  rerender(
    <ScoreBoard {...props} team2Slots={team2} isBuilding={false} onSwapSlots={jest.fn()} />,
  );
  expect(mockAvatarRender).toHaveBeenCalledTimes(1);
  expect(mockAvatarRender).toHaveBeenCalledWith('Drew Beach');
  expect(gestures).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('score-display-team1')).toHaveTextContent('00');
});

it('updates player chips and their callbacks when teams change', () => {
  const firstRemove = jest.fn();
  const latestRemove = jest.fn();
  const props = { team1Slots: team1, team2Slots: team2, score1: 21, score2: 19, isBuilding: false };
  const { rerender } = render(<ScoreBoard {...props} onRemovePlayer={firstRemove} />);

  rerender(
    <ScoreBoard
      {...props}
      team1Slots={[team2[0], team1[1]]}
      team2Slots={[team1[0], team2[1]]}
      onRemovePlayer={latestRemove}
    />,
  );
  expect(screen.getByTestId('team1-slot0').props.accessibilityLabel).toContain('Casey Beach');
  fireEvent.press(screen.getByLabelText('Remove Casey Beach'));
  expect(firstRemove).not.toHaveBeenCalled();
  expect(latestRemove).toHaveBeenCalledWith(1, 0);
});

it('updates roster badges and disabled state when a player joins a team', () => {
  const onSelectPlayer = jest.fn();
  const props = { roster: players, team1: emptyTeam, team2: emptyTeam, search: '', onSearch: jest.fn(), onSelectPlayer };
  const { rerender } = render(<RosterPicker {...props} />);
  rerender(<RosterPicker {...props} team1={[players[0]!, emptyTeam[1]]} />);

  expect(screen.getByTestId('roster-chip-1')).toBeDisabled();
  expect(screen.getByTestId('roster-chip-1')).toHaveTextContent('T1');
  fireEvent.press(screen.getByTestId('roster-chip-1'));
  expect(onSelectPlayer).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('roster-chip-2'));
  expect(onSelectPlayer).toHaveBeenCalledWith(players[1]);
});
