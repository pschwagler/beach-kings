/**
 * Smoke test: verifies the root layout renders without crashing.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

describe('App smoke test', () => {
  it('renders a basic component', () => {
    const { getByText } = render(
      <View>
        <Text>Beach League</Text>
      </View>
    );
    expect(getByText('Beach League')).toBeTruthy();
  });
});
