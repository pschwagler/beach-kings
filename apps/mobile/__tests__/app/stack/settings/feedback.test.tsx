/**
 * Behavior tests for the Leave Feedback screen.
 *
 * Covers:
 *   - Screen renders with input and Cancel/Send actions
 *   - Send is disabled when input is empty (does not call api)
 *   - Cancel returns to the previous screen
 *   - Submitting calls api.submitFeedback with trimmed text and navigates back
 *   - On submission failure, an error message is shown
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Stack: {
      Screen: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    },
  };
});

const mockSubmitFeedback = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  return { __esModule: true, default: Svg, Svg, Path };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textInverse: '#fffdf8',
    textTertiary: '#697577',
  }),
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
  };
});

const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

import FeedbackRoute from '../../../../app/(stack)/settings/feedback';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FeedbackScreen — render', () => {
  it('renders feedback screen with input and actions', () => {
    render(<FeedbackRoute />);
    expect(screen.getByTestId('feedback-screen')).toBeTruthy();
    expect(screen.getByTestId('feedback-input')).toBeTruthy();
    expect(screen.getByTestId('feedback-cancel-btn')).toBeTruthy();
    expect(screen.getByTestId('feedback-submit-btn')).toBeTruthy();
  });
});

describe('FeedbackScreen — actions', () => {
  it('does not submit when input is empty', () => {
    render(<FeedbackRoute />);
    fireEvent.press(screen.getByTestId('feedback-submit-btn'));
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it('returns to previous screen when Cancel is pressed', () => {
    render(<FeedbackRoute />);
    fireEvent.press(screen.getByTestId('feedback-cancel-btn'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('submits feedback with trimmed text and navigates back on success', async () => {
    mockSubmitFeedback.mockResolvedValue({ id: 1 });
    render(<FeedbackRoute />);
    fireEvent.changeText(screen.getByTestId('feedback-input'), '  App is great!  ');
    fireEvent.press(screen.getByTestId('feedback-submit-btn'));
    await waitFor(() => {
      expect(mockSubmitFeedback).toHaveBeenCalledWith('App is great!');
    });
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
    expect(mockAlert).toHaveBeenCalled();
  });

  it('shows an error message when submission fails', async () => {
    mockSubmitFeedback.mockRejectedValue(new Error('network'));
    render(<FeedbackRoute />);
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'bug report');
    fireEvent.press(screen.getByTestId('feedback-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('feedback-error')).toBeTruthy();
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
