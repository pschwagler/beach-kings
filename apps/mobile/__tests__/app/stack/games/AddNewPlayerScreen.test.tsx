/**
 * Unit tests for AddNewPlayerScreen — the "Add New Player" formSheet body.
 *
 * Replaces the old AddNewPlayerSheet.test.tsx. The screen now owns the
 * createPlaceholder call and hands the created player back through
 * AddNewPlayerContext (no more onCreate/onCancel props).
 *
 * Covers:
 *   - prefill "Brad K" → first="Brad", last="K"
 *   - inferred gender/level pre-select the matching chips
 *   - submit disabled until first name is non-empty
 *   - submit → api.createPlaceholder with trimmed name + league/gender/level,
 *     then setResult(...) + router.back()
 *   - createPlaceholder rejection → inline error, no setResult, no back
 *   - cancel button → router.back(), no result
 *   - mid-flight unmount → no setResult
 *   - search-context line shown only when prefillName is non-empty
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type {
  AddNewPlayerRequest,
  AddNewPlayerResult,
} from '@/contexts/AddNewPlayerContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
}));

const mockCreatePlaceholder = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  api: {
    createPlaceholder: (...args: unknown[]) => mockCreatePlaceholder(...args),
  },
}));

// Controllable bridge — `mockRequest` drives the seeded form; `mockSetResult`
// captures the created player handed back to the score screen.
let mockRequest: AddNewPlayerRequest | null = null;
const mockSetResult = jest.fn();
jest.mock('@/contexts/AddNewPlayerContext', () => ({
  __esModule: true,
  useAddNewPlayer: () => ({
    request: mockRequest,
    result: null,
    setRequest: jest.fn(),
    clearRequest: jest.fn(),
    setResult: mockSetResult,
    consumeResult: jest.fn(),
  }),
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'light',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  return { __esModule: true, default: Svg, Svg, Path: () => null, Circle: () => null };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import AddNewPlayerScreen from '@/components/screens/Games/AddNewPlayerScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<AddNewPlayerRequest> = {},
): AddNewPlayerRequest {
  return {
    team: 1,
    slot: 0,
    prefillName: '',
    inferredGender: null,
    inferredLevel: null,
    leagueId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest = makeRequest();
  mockCreatePlaceholder.mockResolvedValue({
    player_id: 99,
    name: 'New Player',
    invite_token: 'tok',
    invite_url: 'https://x/invite/tok',
  });
});

// ---------------------------------------------------------------------------
// Prefill
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — prefill from name', () => {
  it('splits "Brad K" into first="Brad" and last="K"', () => {
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe('K');
  });

  it('puts everything into first when there is no space', () => {
    mockRequest = makeRequest({ prefillName: 'Brad' });
    render(<AddNewPlayerScreen />);

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe('');
  });

  it('first token → first, rest → last for a multi-word name', () => {
    mockRequest = makeRequest({ prefillName: 'Brad Karl Smith' });
    render(<AddNewPlayerScreen />);

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe(
      'Karl Smith',
    );
  });
});

// ---------------------------------------------------------------------------
// Inferred chip pre-selection
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — inferred chip pre-selection', () => {
  it('marks the female gender chip active when inferredGender="female"', () => {
    mockRequest = makeRequest({
      prefillName: 'Brad K',
      inferredGender: 'female',
    });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByTestId('add-new-player-gender-female').props
        .accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('add-new-player-gender-male').props.accessibilityState
        ?.selected,
    ).toBe(false);
  });

  it('marks the advanced level chip active when inferredLevel="advanced"', () => {
    mockRequest = makeRequest({
      prefillName: 'Brad K',
      inferredLevel: 'advanced',
    });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByTestId('add-new-player-level-advanced').props
        .accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('add-new-player-level-beginner').props
        .accessibilityState?.selected,
    ).toBe(false);
  });

  it('leaves all gender chips unselected when inferredGender is null', () => {
    mockRequest = makeRequest({ prefillName: '' });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByTestId('add-new-player-gender-male').props.accessibilityState
        ?.selected,
    ).toBe(false);
    expect(
      screen.getByTestId('add-new-player-gender-female').props
        .accessibilityState?.selected,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Submit disabled state
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — submit disabled state', () => {
  it('submit is disabled when first name is empty', () => {
    mockRequest = makeRequest({ prefillName: '' });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByTestId('add-new-player-submit').props.accessibilityState
        ?.disabled,
    ).toBe(true);
  });

  it('submit enables once a first name is entered', async () => {
    mockRequest = makeRequest({ prefillName: '' });
    render(<AddNewPlayerScreen />);

    fireEvent.changeText(screen.getByTestId('add-new-player-first'), 'Brad');

    await waitFor(() => {
      expect(
        screen.getByTestId('add-new-player-submit').props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });
  });

  it('submit enabled when prefillName provides a first name', () => {
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByTestId('add-new-player-submit').props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Submit → createPlaceholder + setResult + back
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — submit', () => {
  it('calls createPlaceholder with trimmed name + gender/level, then setResult + back', async () => {
    mockRequest = makeRequest({
      team: 2,
      slot: 1,
      prefillName: 'Brad K',
      inferredGender: 'male',
      inferredLevel: 'advanced',
    });
    render(<AddNewPlayerScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledTimes(1);
    expect(mockCreatePlaceholder).toHaveBeenCalledWith({
      name: 'Brad K',
      gender: 'male',
      level: 'advanced',
    });
    expect(mockSetResult).toHaveBeenCalledWith({
      team: 2,
      slot: 1,
      name: 'Brad K',
      player_id: 99,
      invite_url: 'https://x/invite/tok',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('includes league_id in the payload when the request carries a leagueId', async () => {
    mockRequest = makeRequest({ prefillName: 'Alex', leagueId: 3 });
    render(<AddNewPlayerScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alex', league_id: 3 }),
    );
  });

  it('omits gender/level when no chips are selected', async () => {
    mockRequest = makeRequest({ prefillName: 'Alex' });
    render(<AddNewPlayerScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledWith({ name: 'Alex' });
  });

  it('trims whitespace from typed first/last before submit', async () => {
    mockRequest = makeRequest({ prefillName: '' });
    render(<AddNewPlayerScreen />);

    fireEvent.changeText(
      screen.getByTestId('add-new-player-first'),
      '  Brad  ',
    );
    fireEvent.changeText(screen.getByTestId('add-new-player-last'), '  K  ');

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledWith({ name: 'Brad K' });
  });

  it('sends the selected gender when a chip is tapped', async () => {
    mockRequest = makeRequest({ prefillName: 'Alex' });
    render(<AddNewPlayerScreen />);

    fireEvent.press(screen.getByTestId('add-new-player-gender-female'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ gender: 'female' }),
    );
  });

  it('sends the selected level when a chip is tapped', async () => {
    mockRequest = makeRequest({ prefillName: 'Alex' });
    render(<AddNewPlayerScreen />);

    fireEvent.press(screen.getByTestId('add-new-player-level-beginner'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockCreatePlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'beginner' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — createPlaceholder rejection', () => {
  it('shows an inline error and does not setResult or back', async () => {
    mockCreatePlaceholder.mockRejectedValueOnce(new Error('Network error'));
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('add-new-player-error')).toBeTruthy();
    });
    expect(screen.getByTestId('add-new-player-error').props.children).toBe(
      'Network error',
    );
    expect(mockSetResult).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('clears the error on a subsequent successful submit', async () => {
    mockCreatePlaceholder
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce({
        player_id: 99,
        name: 'Brad K',
        invite_token: 'tok',
        invite_url: 'https://x/invite/tok',
      });
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('add-new-player-error')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('add-new-player-error')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — cancel', () => {
  it('calls router.back() and does not setResult when Cancel is pressed', () => {
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSetResult).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mid-flight unmount guard
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — unmount mid-flight', () => {
  it('does not setResult when unmounted before createPlaceholder resolves', async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreatePlaceholder.mockReturnValueOnce(
      new Promise((res) => {
        resolveCreate = res;
      }),
    );
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    const { unmount } = render(<AddNewPlayerScreen />);

    fireEvent.press(screen.getByTestId('add-new-player-submit'));

    unmount();

    await act(async () => {
      resolveCreate({
        player_id: 99,
        name: 'Brad K',
        invite_token: 'tok',
        invite_url: 'https://x/invite/tok',
      });
    });

    expect(mockSetResult).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Search-context line
// ---------------------------------------------------------------------------

describe('AddNewPlayerScreen — search context line', () => {
  it('renders the no-match line when prefillName is non-empty', () => {
    mockRequest = makeRequest({ prefillName: 'Brad K' });
    render(<AddNewPlayerScreen />);

    expect(
      screen.getByText(/No Beach League match for "Brad K"/),
    ).toBeTruthy();
  });

  it('omits the no-match line when prefillName is empty', () => {
    mockRequest = makeRequest({ prefillName: '' });
    render(<AddNewPlayerScreen />);

    expect(screen.queryByText(/No Beach League match/)).toBeNull();
  });
});
