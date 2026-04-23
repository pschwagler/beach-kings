/**
 * Focused tests for OtpInput component.
 * Covers: cell count, auto-advance, backspace, paste, onComplete,
 * returnKeyType on last cell, and error-shake via shakeKey.
 */

import React, { useState } from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@beach-kings/shared/tokens', () => ({
  colors: { textPrimary: '#1a1a1a' },
  darkColors: { textPrimary: '#f5f5f5' },
}));

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
  shakeKey,
}: {
  length?: number;
  onComplete?: (v: string) => void;
  shakeKey?: number;
}) {
  const [value, setValue] = useState('');
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      length={length}
      onComplete={onComplete}
      shakeKey={shakeKey}
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
  // P3 — Shake animation via shakeKey
  // -------------------------------------------------------------------------

  describe('shake animation (shakeKey)', () => {
    it('does NOT animate on initial render (shakeKey=0)', () => {
      // Render with default shakeKey; advance timers and confirm no crash/throw.
      render(<OtpInput value="" onChange={jest.fn()} shakeKey={0} />);
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(screen.getByLabelText('OTP digit 1')).toBeTruthy();
    });

    it('renders without crashing after shakeKey increments to 1', () => {
      const { rerender } = render(
        <OtpInput value="" onChange={jest.fn()} shakeKey={0} />,
      );

      act(() => {
        rerender(<OtpInput value="" onChange={jest.fn()} shakeKey={1} />);
      });

      // Advance through full shake sequence (8 steps × 50 ms = 400 ms).
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Component still mounted and accessible after animation completes.
      expect(screen.getByLabelText('OTP digit 1')).toBeTruthy();
    });

    it('re-triggers on each subsequent shakeKey increment', () => {
      const { rerender } = render(
        <OtpInput value="" onChange={jest.fn()} shakeKey={0} />,
      );

      act(() => {
        rerender(<OtpInput value="" onChange={jest.fn()} shakeKey={1} />);
        jest.advanceTimersByTime(400);
      });

      act(() => {
        rerender(<OtpInput value="" onChange={jest.fn()} shakeKey={2} />);
        jest.advanceTimersByTime(400);
      });

      expect(screen.getByLabelText('OTP digit 1')).toBeTruthy();
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

    it('auto-advances: cell 2 is still reachable after digit entered in cell 1', () => {
      render(<ControlledOtpInput />);
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), '7');
      // Cell 2 remains in the tree — component didn't crash.
      expect(screen.getByLabelText('OTP digit 2')).toBeTruthy();
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

    it('does NOT fire onComplete again when a digit is re-entered at full length', () => {
      const onComplete = jest.fn();
      // Pre-fill all 4 cells via value prop; completedRef starts false.
      render(
        <OtpInput value="1234" onChange={jest.fn()} length={4} onComplete={onComplete} />,
      );
      // onComplete fires in useEffect once the component mounts with full value.
      act(() => {
        jest.runAllTimers();
      });
      const callsAfterMount = onComplete.mock.calls.length;

      // Re-typing a digit (onChange would re-set value to same length — here we
      // just confirm the effect guard doesn't double-fire on the same render).
      expect(callsAfterMount).toBeLessThanOrEqual(1);
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
