/**
 * Focused tests for OtpInput component.
 * Covers: cell count, backspace, paste, onComplete, and returnKeyType.
 */

import React, { useState } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('@beach-kings/shared/tokens', () =>
  jest.requireActual('@beach-kings/shared/tokens'),
);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import OtpInput from '@/components/ui/OtpInput';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Controlled wrapper so we can drive value changes through the component's
 * own onChange callback the same way a real form would.
 */
function ControlledOtpInput({
  length = 6,
  onComplete,
}: {
  length?: number;
  onComplete?: (v: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      length={length}
      onComplete={onComplete}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OtpInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders 6 cells by default', () => {
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

    it('populates cells from the value prop', () => {
      render(<OtpInput value="123" onChange={jest.fn()} />);
      expect(screen.getByLabelText('OTP digit 1')).toHaveProp('value', '1');
      expect(screen.getByLabelText('OTP digit 2')).toHaveProp('value', '2');
      expect(screen.getByLabelText('OTP digit 3')).toHaveProp('value', '3');
      // Cells beyond current value are empty.
      expect(screen.getByLabelText('OTP digit 4')).toHaveProp('value', '');
    });
  });

  // -------------------------------------------------------------------------
  // H4 — returnKeyType on last cell
  // -------------------------------------------------------------------------

  describe('returnKeyType', () => {
    it('last cell (index 5 of 6) has returnKeyType="done"', () => {
      render(<OtpInput value="" onChange={jest.fn()} />);
      expect(screen.getByLabelText('OTP digit 6')).toHaveProp('returnKeyType', 'done');
    });

    it('first cell has returnKeyType="next"', () => {
      render(<OtpInput value="" onChange={jest.fn()} />);
      expect(screen.getByLabelText('OTP digit 1')).toHaveProp('returnKeyType', 'next');
    });

    it('intermediate cells (2-5) have returnKeyType="next"', () => {
      render(<OtpInput value="" onChange={jest.fn()} />);
      for (let i = 2; i <= 5; i++) {
        expect(screen.getByLabelText(`OTP digit ${i}`)).toHaveProp('returnKeyType', 'next');
      }
    });

    it('last cell of a custom-length input has returnKeyType="done"', () => {
      render(<OtpInput length={4} value="" onChange={jest.fn()} />);
      expect(screen.getByLabelText('OTP digit 4')).toHaveProp('returnKeyType', 'done');
      expect(screen.getByLabelText('OTP digit 3')).toHaveProp('returnKeyType', 'next');
    });
  });

  // -------------------------------------------------------------------------
  // Core interactions — regression guard
  // -------------------------------------------------------------------------

  describe('interactions', () => {
    it('calls onChange with the typed digit', () => {
      const onChange = jest.fn();
      render(<OtpInput value="" onChange={onChange} />);
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '3');
      expect(onChange).toHaveBeenCalledWith('3');
    });

    it('calls onComplete exactly once when full length reached', () => {
      const onComplete = jest.fn();
      render(<ControlledOtpInput length={4} onComplete={onComplete} />);

      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '1');
      fireEvent.changeText(screen.getByLabelText('OTP digit 2'), '2');
      fireEvent.changeText(screen.getByLabelText('OTP digit 3'), '3');
      fireEvent.changeText(screen.getByLabelText('OTP digit 4'), '4');

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith('1234');
    });

    it('handles paste by filling all cells from the first input', () => {
      const onChange = jest.fn();
      render(<OtpInput value="" onChange={onChange} />);
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '123456');
      expect(onChange).toHaveBeenCalledWith('123456');
    });

    it('handles backspace on an empty cell by calling onChange to clear previous', () => {
      const onChange = jest.fn();
      // value="12" → cell 3 is empty; backspace on cell 3 clears position 1.
      render(<OtpInput value="12" onChange={onChange} />);
      fireEvent(
        screen.getByLabelText('OTP digit 3'),
        'keyPress',
        { nativeEvent: { key: 'Backspace' } },
      );
      expect(onChange).toHaveBeenCalled();
    });
  });
});
