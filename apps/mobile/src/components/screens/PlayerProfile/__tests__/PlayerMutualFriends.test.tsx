import { render } from '@testing-library/react-native';
import PlayerMutualFriends from '../PlayerMutualFriends';

describe('PlayerMutualFriends', () => {
  it('uses a stable player identity when the API name is blank', () => {
    const view = render(
      <PlayerMutualFriends
        mutualFriends={[
          { player_id: 99, full_name: '  ', avatar: null },
        ]}
      />,
    );

    expect(view.getAllByText('Player 99')).toHaveLength(1);
    expect(view.queryByText('?')).toBeNull();
  });

  it('passes the API name through to the shared avatar and label', () => {
    const view = render(
      <PlayerMutualFriends
        mutualFriends={[
          { player_id: 7, full_name: 'Ari King', avatar: null },
        ]}
      />,
    );

    expect(view.getByLabelText('Ari King')).toBeTruthy();
    expect(view.getByText('Ari King')).toBeTruthy();
  });
});
