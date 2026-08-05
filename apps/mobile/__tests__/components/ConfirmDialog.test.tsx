/**
 * Tests for ConfirmDialog — the reusable centered confirm modal.
 *
 * Covers:
 *   - Visibility gating (renders when visible, absent when not).
 *   - Title / message / button labels render from props.
 *   - onConfirm / onCancel callbacks fire on the right presses.
 *   - Backdrop tap invokes onCancel.
 *   - Destructive variant styles the confirm button with bg-danger.
 *   - Primary variant styles the confirm button with bg-brand-gold.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ---------------------------------------------------------------------------
// Shared props helper
// ---------------------------------------------------------------------------

function baseProps(
  overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
): React.ComponentProps<typeof ConfirmDialog> {
  return {
    visible: true,
    title: 'Discard this game?',
    message: "You haven't saved this game yet.",
    confirmLabel: 'Discard',
    confirmVariant: 'destructive',
    cancelLabel: 'Keep Scoring',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    testID: 'dlg',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfirmDialog', () => {
  describe('visibility', () => {
    it('renders title, message, and buttons when visible', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByText('Discard this game?')).toBeTruthy();
      expect(screen.getByText("You haven't saved this game yet.")).toBeTruthy();
      expect(screen.getByText('Discard')).toBeTruthy();
      expect(screen.getByText('Keep Scoring')).toBeTruthy();
    });

    it('renders nothing when not visible', () => {
      const { toJSON } = render(
        <ConfirmDialog {...baseProps({ visible: false })} />,
      );
      // RN Modal with visible=false collapses to null in the test renderer.
      expect(toJSON()).toBeNull();
    });
  });

  describe('callbacks', () => {
    it('calls onConfirm when the confirm button is pressed', () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...baseProps({ onConfirm })} />);
      fireEvent.press(screen.getByTestId('dlg-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when the cancel button is pressed', () => {
      const onCancel = jest.fn();
      render(<ConfirmDialog {...baseProps({ onCancel })} />);
      fireEvent.press(screen.getByTestId('dlg-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when the backdrop is pressed', () => {
      const onCancel = jest.fn();
      render(<ConfirmDialog {...baseProps({ onCancel })} />);
      fireEvent.press(screen.getByTestId('dlg-backdrop'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('variants', () => {
    it('applies bg-danger to confirm button in destructive variant', () => {
      render(
        <ConfirmDialog {...baseProps({ confirmVariant: 'destructive' })} />,
      );
      const confirmBtn = screen.getByTestId('dlg-confirm');
      const className: string = confirmBtn.props.className ?? '';
      expect(className).toContain('bg-danger');
      expect(className).not.toContain('bg-brand-gold');
      expect(screen.getByText('Discard').props.className).toContain(
        'text-on-danger',
      );
    });

    it('applies bg-brand-gold to confirm button in primary variant', () => {
      render(<ConfirmDialog {...baseProps({ confirmVariant: 'primary' })} />);
      const confirmBtn = screen.getByTestId('dlg-confirm');
      const className: string = confirmBtn.props.className ?? '';
      expect(className).toContain('bg-brand-gold');
      expect(className).not.toContain('bg-danger');
      expect(screen.getByText('Discard').props.className).toContain(
        'text-on-brand-gold',
      );
    });

    it('defaults to primary variant when confirmVariant is omitted', () => {
      const props = baseProps();
      const { confirmVariant: _ignored, ...rest } = props;
      render(<ConfirmDialog {...rest} />);
      const confirmBtn = screen.getByTestId('dlg-confirm');
      const className: string = confirmBtn.props.className ?? '';
      expect(className).toContain('bg-brand-gold');
    });
  });

  describe('without testID', () => {
    it('exposes default testIDs when none provided', () => {
      const props = baseProps();
      const { testID: _ignored, ...rest } = props;
      render(<ConfirmDialog {...rest} />);
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeTruthy();
      expect(screen.getByTestId('confirm-dialog-cancel')).toBeTruthy();
      expect(screen.getByTestId('confirm-dialog-backdrop')).toBeTruthy();
    });
  });
});
