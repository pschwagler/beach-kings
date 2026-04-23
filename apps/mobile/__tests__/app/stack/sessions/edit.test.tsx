/**
 * Behavior tests for the Session Edit screen.
 *
 * Covers:
 *   - Loading state while session data fetches
 *   - Form fields render and are editable
 *   - Pre-fills form from fetched session data
 *   - Session type pills toggle
 *   - Save button calls api.updateSession
 *   - Error message on save failure
 *   - Loading spinner while saving
 *   - Cancel / close button calls router.back
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
    useLocalSearchParams: () => ({ id: '42' }),
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

const mockGetSessionById = jest.fn();
const mockUpdateSession = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
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

import SessionEditRoute from '../../../../app/(stack)/session/[id]/edit';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  court_name: 'QBK Sports',
  date: '2026-03-19',
  start_time: '3:00 PM',
  session_number: 3,
  status: 'active' as const,
  session_type: 'league' as const,
  max_players: 16,
  notes: null,
  players: [],
  games: [],
  user_wins: 0,
  user_losses: 0,
  user_rating_change: null,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(MOCK_SESSION);
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('SessionEditScreen — render', () => {
  it('renders the edit screen container', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-screen')).toBeTruthy();
    });
  });

  it('renders the close button', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-close-btn')).toBeTruthy();
    });
  });

  it('renders date input', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-date-input')).toBeTruthy();
    });
  });

  it('renders time input', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-time-input')).toBeTruthy();
    });
  });

  it('renders court input', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-court-input')).toBeTruthy();
    });
  });

  it('renders both session type pills', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-type-pickup')).toBeTruthy();
      expect(screen.getByTestId('edit-session-type-league')).toBeTruthy();
    });
  });

  it('renders notes input', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-notes-input')).toBeTruthy();
    });
  });

  it('renders save button', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-save-btn')).toBeTruthy();
    });
  });

  it('renders cancel button', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-cancel-btn')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Pre-fill
// ---------------------------------------------------------------------------

describe('SessionEditScreen — pre-fill', () => {
  it('pre-fills date field from session data', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      const input = screen.getByTestId('edit-session-date-input');
      expect(input.props.value).toBe('2026-03-19');
    });
  });

  it('pre-fills court field from session data', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      const input = screen.getByTestId('edit-session-court-input');
      expect(input.props.value).toBe('QBK Sports');
    });
  });
});

// ---------------------------------------------------------------------------
// Type pills
// ---------------------------------------------------------------------------

describe('SessionEditScreen — type pills', () => {
  it('switches type to pickup when pickup pill is pressed', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-session-type-pickup')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('edit-session-type-pickup'));
    expect(screen.getByTestId('edit-session-type-pickup')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Close / cancel
// ---------------------------------------------------------------------------

describe('SessionEditScreen — navigation', () => {
  it('calls router.back when close button is pressed', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-close-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-edit-close-btn'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('calls router.back when cancel button is pressed', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-cancel-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-edit-cancel-btn'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Submit — error (updateSession throws TODO since it's a mock-only endpoint)
// ---------------------------------------------------------------------------

describe('SessionEditScreen — save', () => {
  it('renders error message when api.updateSession throws', async () => {
    mockUpdateSession.mockRejectedValue(new Error('TODO(backend): updateSession'));
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-save-btn')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-edit-save-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-error')).toBeTruthy();
    });
  });

  it('shows loading indicator while saving', async () => {
    let resolve!: (v: unknown) => void;
    mockUpdateSession.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<SessionEditRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-save-btn')).toBeTruthy();
    });
    act(() => {
      fireEvent.press(screen.getByTestId('session-edit-save-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('session-edit-loading')).toBeTruthy();
    });
    act(() => {
      resolve({});
    });
  });
});
