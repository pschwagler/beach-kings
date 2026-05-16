/**
 * Unit tests for ScoreboardToast — bottom-pill confirmation toast
 * for the score screen (Wave A3).
 *
 * Covers:
 *   - renders the message text when visible
 *   - renders and calls onShare when provided
 *   - omits the share control when onShare is not provided
 *   - calls onDismiss after the auto-dismiss timer elapses
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — reanimated (synchronous stubs so withTiming/withDelay/runOnJS
// resolve immediately, matching the pattern in score-game.test.tsx).
// ---------------------------------------------------------------------------

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown, _opts?: unknown, cb?: (finished: boolean) => void) => {
      if (cb) cb(true);
      return v;
    },
    withDelay: (_delay: unknown, animation: unknown) => animation,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    Easing: { out: () => ({}), in: () => ({}), ease: {}, cubic: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  return { __esModule: true, default: Svg, Svg, Path, Circle };
});

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    CheckIcon: makeIcon('CheckIcon'),
    ShareIcon: makeIcon('ShareIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ScoreboardToast from '../../../../src/components/screens/Games/ScoreboardToast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScoreboardToast — message rendering', () => {
  it('renders the message text when visible', () => {
    render(
      <ScoreboardToast
        visible
        message="Brad K added to Team 2"
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByTestId('scoreboard-toast-message').props.children).toBe(
      'Brad K added to Team 2',
    );
  });

  it('does not render when visible is false', () => {
    render(
      <ScoreboardToast
        visible={false}
        message="Brad K added to Team 2"
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('scoreboard-toast')).toBeNull();
  });
});

describe('ScoreboardToast — share action', () => {
  it('renders the share control and calls onShare when provided and pressed', () => {
    const onShare = jest.fn();
    render(
      <ScoreboardToast
        visible
        message="Brad K added to Team 2"
        onShare={onShare}
        onDismiss={jest.fn()}
      />,
    );
    const shareBtn = screen.getByTestId('scoreboard-toast-share');
    expect(shareBtn).toBeTruthy();
    fireEvent.press(shareBtn);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('does not render the share control when onShare is omitted', () => {
    render(
      <ScoreboardToast
        visible
        message="Brad K added to Team 2"
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('scoreboard-toast-share')).toBeNull();
  });
});

describe('ScoreboardToast — auto-dismiss', () => {
  it('calls onDismiss after the linger + fade-out period elapses', () => {
    const onDismiss = jest.fn();
    render(
      <ScoreboardToast
        visible
        message="Brad K added to Team 2"
        onDismiss={onDismiss}
      />,
    );

    // Advance past entry (250ms) + linger (2500ms) + fade-out (250ms) = 3000ms
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
