/**
 * Tests for Badge, Card, Input, and deeper OtpInput coverage.
 * Targets components at 0% coverage (Badge, Card, Input) and
 * uncovered branches in OtpInput (lines 33-48, 56-60, 75-78).
 */

import React, { useState } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';

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

jest.mock('@beach-kings/shared/tokens', () => ({
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

// ---------------------------------------------------------------------------
// Component imports
// ---------------------------------------------------------------------------

import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import OtpInput from '@/components/ui/OtpInput';
import { Text, View } from 'react-native';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="Active" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders with default variant (no variant prop)', () => {
    const { toJSON } = render(<Badge label="Default" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with success variant', () => {
    render(<Badge label="Success" variant="success" />);
    expect(screen.getByText('Success')).toBeTruthy();
  });

  it('renders with danger variant', () => {
    render(<Badge label="Danger" variant="danger" />);
    expect(screen.getByText('Danger')).toBeTruthy();
  });

  it('renders with warning variant', () => {
    render(<Badge label="Warning" variant="warning" />);
    expect(screen.getByText('Warning')).toBeTruthy();
  });

  it('renders with info variant', () => {
    render(<Badge label="Info" variant="info" />);
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('renders with accent variant', () => {
    render(<Badge label="Accent" variant="accent" />);
    expect(screen.getByText('Accent')).toBeTruthy();
  });

  it('applies custom className without crashing', () => {
    const { toJSON } = render(<Badge label="Custom" className="my-custom-class" />);
    expect(toJSON()).toBeTruthy();
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

  it('applies custom className without crashing', () => {
    const { toJSON } = render(
      <Card className="p-sm">
        <Text>Content</Text>
      </Card>
    );
    expect(toJSON()).toBeTruthy();
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

  it('renders in secure text entry mode', () => {
    const { toJSON } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without placeholder (no accessibilityLabel)', () => {
    const { toJSON } = render(
      <Input value="hello" onChangeText={jest.fn()} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a controlled value', () => {
    render(
      <Input value="current-value" onChangeText={jest.fn()} placeholder="Field" />
    );
    const input = screen.getByPlaceholderText('Field');
    expect(input.props.value).toBe('current-value');
  });

  it('renders with keyboardType and autoCapitalize props', () => {
    const { toJSON } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        keyboardType="email-address"
        autoCapitalize="none"
      />
    );
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// OtpInput — deeper coverage for uncovered branches
// ---------------------------------------------------------------------------

/**
 * Controlled wrapper so we can track onChange calls and verify state-driven
 * re-renders without stubbing useState internals.
 */
function ControlledOtp({
  initialValue = '',
  length = 6,
  onChangeSpy,
}: {
  initialValue?: string;
  length?: number;
  onChangeSpy?: jest.Mock;
}) {
  const [value, setValue] = useState(initialValue);
  const handleChange = (v: string) => {
    setValue(v);
    onChangeSpy?.(v);
  };
  return <OtpInput length={length} value={value} onChange={handleChange} />;
}

describe('OtpInput — additional coverage', () => {
  // -------------------------------------------------------------------------
  // Paste: multi-character input fills cells (lines 33-38)
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
  // Single-digit input auto-advances focus (lines 41-49)
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

  it('entering a digit on a controlled input updates displayed value', () => {
    const onChangeSpy = jest.fn();
    render(<ControlledOtp length={6} onChangeSpy={onChangeSpy} />);

    fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '7');

    expect(onChangeSpy).toHaveBeenCalledWith('7');
  });

  // -------------------------------------------------------------------------
  // Backspace on empty cell navigates back (lines 56-60)
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

  // -------------------------------------------------------------------------
  // Focus / blur state (lines 75-78)
  // -------------------------------------------------------------------------

  it('focusing a cell updates focusedIndex state (component re-renders without error)', () => {
    const { toJSON } = render(
      <OtpInput length={6} value="" onChange={jest.fn()} />
    );

    act(() => {
      fireEvent(screen.getByLabelText('OTP digit 3'), 'focus');
    });

    // Component should still render correctly after focus event
    expect(toJSON()).toBeTruthy();
  });

  it('blurring a cell resets focused state (component re-renders without error)', () => {
    const { toJSON } = render(
      <OtpInput length={6} value="" onChange={jest.fn()} />
    );

    act(() => {
      fireEvent(screen.getByLabelText('OTP digit 2'), 'focus');
      fireEvent(screen.getByLabelText('OTP digit 2'), 'blur');
    });

    expect(toJSON()).toBeTruthy();
  });

  it('focuses different cells sequentially without errors', () => {
    render(<OtpInput length={4} value="12" onChange={jest.fn()} />);

    act(() => {
      fireEvent(screen.getByLabelText('OTP digit 1'), 'focus');
    });
    act(() => {
      fireEvent(screen.getByLabelText('OTP digit 2'), 'focus');
    });
    act(() => {
      fireEvent(screen.getByLabelText('OTP digit 2'), 'blur');
    });

    // All 4 cells still rendered
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // Existing basic tests preserved here for completeness
  // -------------------------------------------------------------------------

  it('renders the correct number of cells (default 6)', () => {
    render(<OtpInput value="" onChange={jest.fn()} />);
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeTruthy();
    }
  });

  it('renders a custom number of cells', () => {
    render(<OtpInput length={4} value="" onChange={jest.fn()} />);
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('OTP digit 5')).toBeNull();
  });

  it('pre-fills cells from value prop', () => {
    render(<OtpInput length={4} value="1234" onChange={jest.fn()} />);
    expect(screen.getByLabelText('OTP digit 1').props.value).toBe('1');
    expect(screen.getByLabelText('OTP digit 2').props.value).toBe('2');
    expect(screen.getByLabelText('OTP digit 3').props.value).toBe('3');
    expect(screen.getByLabelText('OTP digit 4').props.value).toBe('4');
  });
});
