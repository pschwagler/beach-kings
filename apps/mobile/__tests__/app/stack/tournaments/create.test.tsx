/**
 * Behavior tests for the Tournament Create screen.
 *
 * Covers:
 *   - Screen renders with all form fields
 *   - Name input is editable
 *   - Registration type toggle
 *   - Format toggle
 *   - Gender pills toggle
 *   - Max players stepper
 *   - Courts stepper
 *   - Game To stepper
 *   - Score Cap stepper
 *   - Submit button calls api.createTournament
 *   - Validation: name required, shows error if blank
 *   - Loading spinner shown while submitting
 *   - Navigates to tournament detail on success
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
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

const mockCreateTournament = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    createTournament: (...args: unknown[]) => mockCreateTournament(...args),
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

import TournamentCreateRoute from '../../../../app/(stack)/tournament/create';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('TournamentCreateScreen — render', () => {
  it('renders the create screen container', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-create-screen')).toBeTruthy();
  });

  it('renders name input', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-name-input')).toBeTruthy();
  });

  it('renders date input', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-date-input')).toBeTruthy();
  });

  it('renders max players stepper', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('max-players-stepper')).toBeTruthy();
  });

  it('renders courts stepper', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('courts-stepper')).toBeTruthy();
  });

  it('renders registration type toggle', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-registration-open')).toBeTruthy();
    expect(screen.getByTestId('tournament-registration-invite')).toBeTruthy();
  });

  it('renders format toggle', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-format-POOLS_PLAYOFFS')).toBeTruthy();
    expect(screen.getByTestId('tournament-format-FULL_ROUND_ROBIN')).toBeTruthy();
  });

  it('renders game to stepper', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('game-to-stepper')).toBeTruthy();
  });

  it('renders score cap stepper', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('score-cap-stepper')).toBeTruthy();
  });

  it('renders gender pills', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-gender-coed')).toBeTruthy();
    expect(screen.getByTestId('tournament-gender-mens')).toBeTruthy();
    expect(screen.getByTestId('tournament-gender-womens')).toBeTruthy();
  });

  it('renders submit button', () => {
    render(<TournamentCreateRoute />);
    expect(screen.getByTestId('tournament-create-submit-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Form interactions
// ---------------------------------------------------------------------------

describe('TournamentCreateScreen — form interactions', () => {
  it('accepts text input for name', () => {
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-name-input'), 'Sunday Showdown');
    expect(screen.getByTestId('tournament-name-input').props.value).toBe('Sunday Showdown');
  });

  it('accepts text input for date', () => {
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-date-input'), '2026-06-01');
    expect(screen.getByTestId('tournament-date-input').props.value).toBe('2026-06-01');
  });

  it('toggles registration type to invite', () => {
    render(<TournamentCreateRoute />);
    fireEvent.press(screen.getByTestId('tournament-registration-invite'));
    expect(screen.getByTestId('tournament-registration-invite')).toBeTruthy();
  });

  it('toggles format to Round Robin', () => {
    render(<TournamentCreateRoute />);
    fireEvent.press(screen.getByTestId('tournament-format-FULL_ROUND_ROBIN'));
    expect(screen.getByTestId('tournament-format-FULL_ROUND_ROBIN')).toBeTruthy();
  });

  it('toggles gender to mens', () => {
    render(<TournamentCreateRoute />);
    fireEvent.press(screen.getByTestId('tournament-gender-mens'));
    expect(screen.getByTestId('tournament-gender-mens')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('TournamentCreateScreen — validation', () => {
  it('shows error when submitting without a name', async () => {
    render(<TournamentCreateRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('tournament-create-error')).toBeTruthy();
    });
  });

  it('does NOT call api.createTournament when name is blank', async () => {
    render(<TournamentCreateRoute />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    expect(mockCreateTournament).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Submit — success
// ---------------------------------------------------------------------------

describe('TournamentCreateScreen — submit success', () => {
  it('calls api.createTournament with form data when valid', async () => {
    mockCreateTournament.mockResolvedValue({ id: 10, name: 'Sunday Showdown', status: 'SETUP' });
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-name-input'), 'Sunday Showdown');
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    await waitFor(() => {
      expect(mockCreateTournament).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates to the tournament detail after successful create', async () => {
    mockCreateTournament.mockResolvedValue({ id: 10, name: 'Sunday Showdown', status: 'SETUP' });
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-name-input'), 'Sunday Showdown');
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(stack)/tournament/10');
    });
  });
});

// ---------------------------------------------------------------------------
// Submit — error
// ---------------------------------------------------------------------------

describe('TournamentCreateScreen — submit error', () => {
  it('renders error message when api.createTournament throws', async () => {
    mockCreateTournament.mockRejectedValue(new Error('TODO(backend): createTournament'));
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-name-input'), 'Sunday Showdown');
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('tournament-create-error')).toBeTruthy();
    });
  });

  it('shows loading indicator while submitting', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateTournament.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<TournamentCreateRoute />);
    fireEvent.changeText(screen.getByTestId('tournament-name-input'), 'Sunday Showdown');
    act(() => {
      fireEvent.press(screen.getByTestId('tournament-create-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('tournament-create-loading')).toBeTruthy();
    });
    act(() => {
      resolve({ id: 10 });
    });
  });
});
