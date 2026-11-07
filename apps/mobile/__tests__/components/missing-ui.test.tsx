/**
 * Tests for Badge, Card, Input, and deeper OtpInput coverage.
 * Covers labels, prop forwarding, text input, paste, and backspace.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any component imports
// ---------------------------------------------------------------------------

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'light',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('@beach-kings/shared/tokens', () => ({
  ...jest.requireActual('@beach-kings/shared/tokens'),
  colors: {
    primary: '#1a3a4a',
    textPrimary: '#1a1a1a',
    textTertiary: '#999999',
  },
  darkColors: {
    textPrimary: '#f5f5f5',
    textTertiary: '#737373',
    brandTeal: '#14b8a6',
  },
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
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
  }),
}));

// ---------------------------------------------------------------------------
// Component imports
// ---------------------------------------------------------------------------

import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import OtpInput from '@/components/ui/OtpInput';
import { Text } from 'react-native';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="Active" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <Text>Card content</Text>
      </Card>
    );
    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('renders multiple children', () => {
    render(
      <Card>
        <Text>First</Text>
        <Text>Second</Text>
      </Card>
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('passes through ViewProps (testID)', () => {
    render(
      <Card testID="my-card">
        <Text>Inner</Text>
      </Card>
    );
    expect(screen.getByTestId('my-card')).toBeTruthy();
  });

  it('passes through accessibilityLabel', () => {
    render(
      <Card accessibilityLabel="Player card">
        <Text>Player info</Text>
      </Card>
    );
    expect(screen.getByLabelText('Player card')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

describe('Input', () => {
  it('renders with placeholder text', () => {
    render(
      <Input value="" onChangeText={jest.fn()} placeholder="Enter email" />
    );
    expect(screen.getByPlaceholderText('Enter email')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    render(
      <Input value="" onChangeText={onChangeText} placeholder="Username" />
    );
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'patrick');
    expect(onChangeText).toHaveBeenCalledWith('patrick');
  });

  it('has accessibilityLabel matching placeholder', () => {
    render(
      <Input value="" onChangeText={jest.fn()} placeholder="Enter password" />
    );
    expect(screen.getByLabelText('Enter password')).toBeTruthy();
  });

  it('renders with a controlled value', () => {
    render(
      <Input value="current-value" onChangeText={jest.fn()} placeholder="Field" />
    );
    const input = screen.getByPlaceholderText('Field');
    expect(input.props.value).toBe('current-value');
  });
});

// ---------------------------------------------------------------------------
// OtpInput — paste and backspace behavior
// ---------------------------------------------------------------------------

describe('OtpInput — paste and backspace', () => {
  // -------------------------------------------------------------------------
  // Paste: multi-character input fills cells
  // -------------------------------------------------------------------------

  it('paste: multi-character text fills cells and calls onChange with digits only', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    // Simulate pasting "123456" into the first cell
    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '123456');

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('paste: strips non-digit characters from pasted text', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '12-34-56');

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('paste: truncates pasted text to the cell length', () => {
    const onChange = jest.fn();
    render(<OtpInput length={4} value="" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '987654');

    expect(onChange).toHaveBeenCalledWith('9876');
  });

  it('paste: pasting on a middle cell still fills from pasted string', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="12" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 3'), '345678');

    expect(onChange).toHaveBeenCalledWith('345678');
  });

  // -------------------------------------------------------------------------
  // Single-digit input
  // -------------------------------------------------------------------------

  it('single digit input calls onChange with updated value', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '5');

    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('single digit input on last cell does not advance past end', () => {
    const onChange = jest.fn();
    render(<OtpInput length={4} value="123" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 4'), '4');

    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('non-digit single input is stripped (no change)', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), 'a');

    // digit becomes '' — onChange is called with empty string for that position
    expect(onChange).toHaveBeenCalledWith('');
  });

  // -------------------------------------------------------------------------
  // Backspace on empty cell
  // -------------------------------------------------------------------------

  it('backspace on non-empty cell does not navigate back', () => {
    const onChange = jest.fn();
    // cell[1] has value '2', so pressing backspace should not trigger navigation
    render(<OtpInput length={6} value="12" onChange={onChange} />);

    fireEvent(screen.getByLabelText('OTP digit 2'), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });

    // onChange is NOT called because the cell is non-empty (guard: !cells[index])
    expect(onChange).not.toHaveBeenCalled();
  });

  it('backspace on empty cell at index > 0 clears previous cell and calls onChange', () => {
    const onChange = jest.fn();
    // cell[1] is empty (''), cell[0] has '1'
    render(<OtpInput length={6} value="1" onChange={onChange} />);

    fireEvent(screen.getByLabelText('OTP digit 2'), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });

    // Should clear index 0 → result is ''
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('backspace on empty first cell (index 0) does nothing', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    fireEvent(screen.getByLabelText('OTP digit 1'), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });

    // index === 0, guard `index > 0` prevents onChange
    expect(onChange).not.toHaveBeenCalled();
  });

  it('non-backspace key press does nothing', () => {
    const onChange = jest.fn();
    render(<OtpInput length={6} value="" onChange={onChange} />);

    fireEvent(screen.getByLabelText('OTP digit 2'), 'keyPress', {
      nativeEvent: { key: 'Delete' },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pre-fills cells from value prop', () => {
    render(<OtpInput length={4} value="1234" onChange={jest.fn()} />);
    expect(screen.getByLabelText('OTP digit 1').props.value).toBe('1');
    expect(screen.getByLabelText('OTP digit 2').props.value).toBe('2');
    expect(screen.getByLabelText('OTP digit 3').props.value).toBe('3');
    expect(screen.getByLabelText('OTP digit 4').props.value).toBe('4');
  });
});
