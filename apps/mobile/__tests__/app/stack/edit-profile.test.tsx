import React from 'react';
import { render } from '@testing-library/react-native';
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const { Text: NativeText } = require('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) =>
      ReactLib.createElement(NativeText, null, href),
  };
});

import EditProfileRoute from '../../../app/(stack)/edit-profile';

describe('legacy edit-profile route', () => {
  it('redirects old deep links to the Profile tab', () => {
    const { getByText } = render(<EditProfileRoute />);
    expect(getByText('/(tabs)/profile')).toBeTruthy();
  });
});
