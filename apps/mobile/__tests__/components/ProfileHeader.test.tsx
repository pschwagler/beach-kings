/**
 * Tests for the Profile tab header (own profile).
 *
 * Focused on S2: the avatar must be seeded by the player's numeric id so the
 * current user's avatar color is identical across every screen (home header,
 * profile, message thread, roster).
 */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textInverse: '#fff' }),
}));

// Avatar stub — reflects the colorSeed via accessibilityHint for assertion.
jest.mock('@/components/ui/Avatar', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  return function Avatar({
    name,
    colorSeed,
  }: {
    name: string;
    colorSeed?: number | string;
  }) {
    return (
      <Text
        testID="avatar"
        accessibilityHint={colorSeed != null ? String(colorSeed) : undefined}
      >
        {name}
      </Text>
    );
  };
});

import ProfileHeader from '@/components/screens/Profile/ProfileHeader';

const baseProps = {
  isLoading: false,
  friendCount: 0,
  onPhotoPress: jest.fn(),
  onFriendsPress: jest.fn(),
};

describe('ProfileHeader avatar', () => {
  it('seeds the avatar color with the player id', () => {
    const player = {
      id: 8,
      first_name: 'Ada',
      last_name: 'Vega',
      name: 'Ada Vega',
    } as never;
    const { getByTestId } = render(
      <ProfileHeader player={player} {...baseProps} />,
    );
    expect(getByTestId('avatar').props.accessibilityHint).toBe('8');
  });
});
