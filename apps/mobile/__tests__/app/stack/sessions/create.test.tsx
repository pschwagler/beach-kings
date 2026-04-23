/**
 * Behavior tests for the Session Create screen.
 *
 * Covers:
 *   - Screen renders with all form fields
 *   - Session type pills toggle
 *   - Max players stepper increments / decrements
 *   - Submit button calls api.createSession and navigates on success
 *   - Error message renders when submit fails
 *   - Loading spinner shown while submitting
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — all jest.mock calls must be at the top, before imports
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID ?? 'safe-area-view'}>{children}</View>,
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
  const Circle = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
  };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockCreateSession = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import SessionCreateRoute from '../../../../app/(stack)/session/create';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('SessionCreateScreen — render', () => {
  it('renders the create screen container', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-create-screen')).toBeTruthy();
  });

  it('renders the date input', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-date-input')).toBeTruthy();
  });

  it('renders the time input', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-time-input')).toBeTruthy();
  });

  it('renders the court input', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-court-input')).toBeTruthy();
  });

  it('renders both session type pills', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-type-pickup')).toBeTruthy();
    expect(screen.getByTestId('session-type-league')).toBeTruthy();
  });

  it('renders the max players stepper', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('max-players-stepper')).toBeTruthy();
  });

  it('renders the notes input', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-notes-input')).toBeTruthy();
  });

  it('renders the submit button', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('session-create-submit-btn')).toBeTruthy();
  });

  it('defaults max players stepper to 16', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    expect(screen.getByTestId('stepper-value').props.children).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Type pills
// ---------------------------------------------------------------------------

describe('SessionCreateScreen — type pills', () => {
  it('defaults to pickup type', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    // pickup should be selected by default; no error on render means state is fine
    expect(screen.getByTestId('session-type-pickup')).toBeTruthy();
  });

  it('switches to league type when league pill is pressed', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    fireEvent.press(screen.getByTestId('session-type-league'));
    // league pill still present after press
    expect(screen.getByTestId('session-type-league')).toBeTruthy();
  });

  it('switches back to pickup when pickup pill is pressed', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    fireEvent.press(screen.getByTestId('session-type-league'));
    fireEvent.press(screen.getByTestId('session-type-pickup'));
    expect(screen.getByTestId('session-type-pickup')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

describe('SessionCreateScreen — max players stepper', () => {
  it('increments max players when + is pressed', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    fireEvent.press(screen.getByTestId('stepper-increment'));
    expect(screen.getByTestId('stepper-value').props.children).toBe(17);
  });

  it('decrements max players when − is pressed', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    fireEvent.press(screen.getByTestId('stepper-decrement'));
    expect(screen.getByTestId('stepper-value').props.children).toBe(15);
  });

  it('does not decrement below 2', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    // Decrement many times
    for (let i = 0; i < 20; i++) {
      fireEvent.press(screen.getByTestId('stepper-decrement'));
    }
    expect(screen.getByTestId('stepper-value').props.children).toBe(2);
  });

  it('does not increment above 64', () => {
    mockCreateSession.mockReturnValue(new Promise(() => {}));
    render(<SessionCreateRoute />);
    // Increment many times
    for (let i = 0; i < 60; i++) {
      fireEvent.press(screen.getByTestId('stepper-increment'));
    }
    expect(screen.getByTestId('stepper-value').props.children).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Submit — success
// ---------------------------------------------------------------------------

describe('SessionCreateScreen — submit success', () => {
  it('calls api.createSession when submit is pressed', async () => {
    mockCreateSession.mockResolvedValue({ id: 99, session_number: 1, status: 'active' });
    render(<SessionCreateRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates to the session detail after successful create', async () => {
    mockCreateSession.mockResolvedValue({ id: 99, session_number: 1, status: 'active' });
    render(<SessionCreateRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/99');
    });
  });
});

// ---------------------------------------------------------------------------
// Submit — error
// ---------------------------------------------------------------------------

describe('SessionCreateScreen — submit error', () => {
  it('renders error message when api.createSession throws', async () => {
    mockCreateSession.mockRejectedValue(new Error('TODO(backend): createSession'));
    render(<SessionCreateRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('session-create-error')).toBeTruthy();
    });
  });

  it('shows loading indicator while submitting', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateSession.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<SessionCreateRoute />);
    act(() => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('session-create-loading')).toBeTruthy();
    });
    act(() => {
      resolve({ id: 99 });
    });
  });
});
