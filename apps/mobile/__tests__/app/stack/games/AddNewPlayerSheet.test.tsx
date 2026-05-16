/**
 * Unit tests for AddNewPlayerSheet — the "Add New Player" form sheet (Wave A4).
 *
 * Covers:
 *   - prefill "Brad K" → first input "Brad", last input "K"
 *   - inferredGender='female' → female gender chip is active
 *   - inferredLevel='advanced' → advanced level chip is active
 *   - submit is disabled until first name is non-empty
 *   - pressing submit calls onCreate with trimmed first/last + selected gender/level
 *   - onCreate rejection → error message rendered inline; onCancel NOT called
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    cancelAnimation: jest.fn(),
    Easing: { inOut: () => ({}), ease: {} },
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

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'light',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('@beach-kings/shared/tokens', () => ({
  lightPalette: {
    bgPage: '#f2f2f7',
    bgSurface: '#ffffff',
    bgElevated: '#ffffff',
    bgInset: '#f2f2f7',
    bgNav: '#1a3a4a',
    bgTabbar: '#ffffff',
    textDefault: '#1a1a1a',
    textMuted: '#6e6e73',
    textTertiary: '#8e8e93',
    textInverse: '#ffffff',
    borderStrong: '#c6c6c8',
    borderDivider: '#c6c6c8',
    brandTeal: '#1a3a4a',
    brandGold: '#d4a843',
    success: '#34c759',
    danger: '#ff3b30',
    warning: '#ff9500',
    info: '#007aff',
    successTint: '#e6f9ec',
    dangerTint: '#fff0ef',
    warningTint: '#fff8e6',
    infoTint: '#e6f2ff',
  },
  darkPalette: {
    bgPage: '#0d1117',
    bgSurface: '#161b22',
    bgElevated: '#1e2430',
    bgInset: '#0d1117',
    bgNav: '#161b22',
    bgTabbar: '#161b22',
    textDefault: '#e6edf3',
    textMuted: '#8b949e',
    textTertiary: '#6e7681',
    textInverse: '#1a1a1a',
    borderStrong: '#30363d',
    borderDivider: '#21262d',
    brandTeal: '#14b8a6',
    brandGold: '#f59e0b',
    success: '#3fb950',
    danger: '#f85149',
    warning: '#d29922',
    info: '#58a6ff',
    successTint: '#1a3a2a',
    dangerTint: '#3a1a1a',
    warningTint: '#3a2e1a',
    infoTint: '#1a2a3a',
  },
  colors: {
    primary: '#1a3a4a',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textInverse: '#ffffff',
    brandTeal: '#0D9488',
  },
  darkColors: {
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
    brandTeal: '#14b8a6',
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import AddNewPlayerSheet from '../../../../src/components/screens/Games/AddNewPlayerSheet';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddNewPlayerSheet — prefill from name', () => {
  it('splits "Brad K" into first="Brad" and last="K"', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe('K');
  });

  it('puts everything into first when there is no space in the name', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe('');
  });

  it('handles a multi-word name: first token → first, rest → last', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad Karl Smith"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('add-new-player-first').props.value).toBe('Brad');
    expect(screen.getByTestId('add-new-player-last').props.value).toBe('Karl Smith');
  });
});

describe('AddNewPlayerSheet — inferred chip pre-selection', () => {
  it('marks the female gender chip as active when inferredGender="female"', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender="female"
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('add-new-player-gender-female').props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('add-new-player-gender-male').props.accessibilityState?.selected,
    ).toBe(false);
  });

  it('marks the advanced level chip as active when inferredLevel="advanced"', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel="advanced"
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('add-new-player-level-advanced').props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('add-new-player-level-beginner').props.accessibilityState?.selected,
    ).toBe(false);
  });

  it('leaves all gender chips unselected when inferredGender is null', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName=""
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('add-new-player-gender-male').props.accessibilityState?.selected,
    ).toBe(false);
    expect(
      screen.getByTestId('add-new-player-gender-female').props.accessibilityState?.selected,
    ).toBe(false);
  });
});

describe('AddNewPlayerSheet — submit disabled state', () => {
  it('submit button is disabled when first name is empty', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName=""
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('add-new-player-submit').props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('submit button is enabled once first name has content', async () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName=""
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('add-new-player-first'), 'Brad');

    await waitFor(() => {
      expect(
        screen.getByTestId('add-new-player-submit').props.accessibilityState?.disabled,
      ).toBe(false);
    });
  });

  it('submit button is enabled when prefillName provides a non-empty first name', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('add-new-player-submit').props.accessibilityState?.disabled,
    ).toBe(false);
  });
});

describe('AddNewPlayerSheet — onCreate call', () => {
  it('calls onCreate with trimmed first, last, selected gender and level on submit', async () => {
    const mockOnCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender="male"
        inferredLevel="advanced"
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockOnCreate).toHaveBeenCalledTimes(1);
    expect(mockOnCreate).toHaveBeenCalledWith({
      first: 'Brad',
      last: 'K',
      gender: 'male',
      level: 'advanced',
    });
  });

  it('trims whitespace from first and last before calling onCreate', async () => {
    const mockOnCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName=""
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('add-new-player-first'), '  Brad  ');
    fireEvent.changeText(screen.getByTestId('add-new-player-last'), '  K  ');

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockOnCreate).toHaveBeenCalledWith({
      first: 'Brad',
      last: 'K',
      gender: null,
      level: null,
    });
  });

  it('passes null gender and level when no chips are selected', async () => {
    const mockOnCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Alex"
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockOnCreate).toHaveBeenCalledWith({
      first: 'Alex',
      last: '',
      gender: null,
      level: null,
    });
  });

  it('updates selected gender when a chip is tapped', async () => {
    const mockOnCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Alex"
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    // Tap the female chip to select it
    fireEvent.press(screen.getByTestId('add-new-player-gender-female'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({ gender: 'female' }),
    );
  });

  it('updates selected level when a chip is tapped', async () => {
    const mockOnCreate = jest.fn().mockResolvedValue(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Alex"
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    // Tap the beginner chip to select it
    fireEvent.press(screen.getByTestId('add-new-player-level-beginner'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    expect(mockOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'beginner' }),
    );
  });
});

describe('AddNewPlayerSheet — onCreate rejection', () => {
  it('shows an inline error and keeps the sheet open when onCreate rejects', async () => {
    const mockOnCancel = jest.fn();
    const mockOnCreate = jest.fn().mockRejectedValue(new Error('Network error'));

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={mockOnCancel}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('add-new-player-error')).toBeTruthy();
    });

    expect(screen.getByTestId('add-new-player-error').props.children).toBe('Network error');
    expect(mockOnCancel).not.toHaveBeenCalled();
  });

  it('clears the error on a subsequent submit attempt', async () => {
    const mockOnCreate = jest
      .fn()
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce(undefined);

    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={mockOnCreate}
        onCancel={jest.fn()}
      />,
    );

    // First submit fails — error appears
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('add-new-player-error')).toBeTruthy();
    });

    // Second submit succeeds — error clears
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-new-player-submit'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('add-new-player-error')).toBeNull();
    });
  });
});

describe('AddNewPlayerSheet — cancel button', () => {
  it('calls onCancel when the Cancel button is pressed', () => {
    const mockOnCancel = jest.fn();
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={mockOnCancel}
      />,
    );

    // Cancel uses the shared Button component which has accessibilityLabel=title
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });
});

describe('AddNewPlayerSheet — search context line', () => {
  it('renders the no-match context line when prefillName is non-empty', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName="Brad K"
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // The context text contains the quoted query inline
    expect(screen.getByText(/No Beach League match for "Brad K"/)).toBeTruthy();
  });

  it('omits the no-match context line when prefillName is empty', () => {
    render(
      <AddNewPlayerSheet
        visible
        prefillName=""
        inferredGender={null}
        inferredLevel={null}
        onCreate={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByText(/No Beach League match/)).toBeNull();
  });
});
