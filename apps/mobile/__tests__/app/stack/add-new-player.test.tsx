/**
 * Coverage test for the app/(stack)/add-new-player.tsx route wrapper.
 *
 * The route is a thin shell: it configures the native formSheet presentation
 * via <Stack.Screen options> and renders <AddNewPlayerScreen />. Form behavior
 * is covered by AddNewPlayerScreen.test.tsx — here we only assert the route
 * mounts the screen and wires the sheet options.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before the route import so Jest hoisting applies
// ---------------------------------------------------------------------------

// Capture the options passed to Stack.Screen so we can assert the sheet config.
const mockCapturedScreenOptions: Array<Record<string, unknown>> = [];

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stack = ({ children }: { children?: React.ReactNode }) => (
    <View testID="stack">{children}</View>
  );
  Stack.Screen = ({ options }: { options?: Record<string, unknown> }) => {
    mockCapturedScreenOptions.push(options ?? {});
    return <View testID="stack-screen" />;
  };
  return { Stack };
});

// Stub the screen — its behavior is tested separately.
jest.mock('@/components/screens/Games', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    AddNewPlayerScreen: () => <View testID="add-new-player-screen" />,
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

describe('app/(stack)/add-new-player — route wrapper', () => {
  let AddNewPlayerRoute: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    AddNewPlayerRoute = require('../../../app/(stack)/add-new-player').default;
  });

  beforeEach(() => {
    mockCapturedScreenOptions.length = 0;
  });

  it('renders the AddNewPlayerScreen', () => {
    const { getByTestId } = render(<AddNewPlayerRoute />);
    expect(getByTestId('add-new-player-screen')).toBeTruthy();
  });

  it('configures a formSheet presentation with grabber and full detent', () => {
    render(<AddNewPlayerRoute />);
    expect(mockCapturedScreenOptions).toHaveLength(1);
    const options = mockCapturedScreenOptions[0];
    expect(options.presentation).toBe('formSheet');
    expect(options.sheetAllowedDetents).toEqual([1.0]);
    expect(options.sheetGrabberVisible).toBe(true);
    expect(options.gestureEnabled).toBe(true);
  });
});
