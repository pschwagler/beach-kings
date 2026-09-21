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
import { fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Modal as RNModal, Platform, View } from 'react-native';
import { renderWithTheme as render } from '../../test-utils/renderWithTheme';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

jest.mock('nativewind', () => ({
  useColorScheme: () => ({
    colorScheme: 'light',
    setColorScheme: jest.fn(),
  }),
  vars: (values: object) => values,
}));

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
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('visibility', () => {
    it('renders title, message, and buttons when visible', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByText('Discard this game?')).toBeTruthy();
      expect(screen.getByText("You haven't saved this game yet.")).toBeTruthy();
      expect(screen.getByText('Discard')).toBeTruthy();
      expect(screen.getByText('Keep Scoring')).toBeTruthy();
    });

    it('renders nothing when not visible', () => {
      render(
        <ConfirmDialog {...baseProps({ visible: false })} />,
      );
      expect(screen.queryByTestId('dlg')).toBeNull();
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
      fireEvent.press(screen.getByTestId('dlg-backdrop', { includeHiddenElements: true }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('supports accessibility escape and system back dismissal', () => {
      const onCancel = jest.fn();
      const view = render(<ConfirmDialog {...baseProps({ onCancel })} />);

      fireEvent(screen.getByTestId('dlg'), 'accessibilityEscape');
      fireEvent(view.UNSAFE_getByType(RNModal), 'requestClose');

      expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it('guards repeated semantic confirmation until pending settles', () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...baseProps({ onConfirm })} />);

      fireEvent.press(screen.getByTestId('dlg-confirm'));
      fireEvent.press(screen.getByTestId('dlg-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('exposes one dialog subtree and keeps the backdrop out of traversal', () => {
      const view = render(<ConfirmDialog {...baseProps()} />);
      const dialog = screen.getByTestId('dlg');

      expect(dialog).toHaveProp('role', 'dialog');
      expect(dialog).toHaveProp('accessibilityLabel', 'Discard this game?');
      expect(dialog).toHaveProp('accessibilityViewIsModal', true);
      expect(screen.getByLabelText('Discard')).toBeTruthy();
      expect(screen.getByLabelText('Keep Scoring')).toBeTruthy();
      expect(screen.getByTestId('dlg-backdrop', { includeHiddenElements: true }))
        .toHaveProp('accessible', false);
      expect(view.UNSAFE_getByType(RNModal)).toHaveProp('accessibilityViewIsModal', true);
    });

    it('requests focus when the native modal appears', () => {
      const view = render(<ConfirmDialog {...baseProps()} />);
      const modal = view.UNSAFE_getByType(RNModal);

      expect(modal.props.onShow).toEqual(expect.any(Function));
      fireEvent(modal, 'show');
    });

    it('restores launcher focus once and only after native dismissal', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const setFocus = jest
        .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
        .mockImplementation(() => undefined);

      function Harness(): React.ReactNode {
        const [visible, setVisible] = React.useState(true);
        const triggerRef = React.useRef<View>(42 as unknown as View);
        return (
          <ConfirmDialog
            {...baseProps({
              visible,
              onCancel: () => setVisible(false),
              returnFocusRef: triggerRef,
            })}
          />
        );
      }

      const view = render(<Harness />);
      const callsBeforeClose = setFocus.mock.calls.length;
      fireEvent.press(screen.getByTestId('dlg-cancel'));
      expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose);

      const nativeModal = view.UNSAFE_getByType(RNModal);
      fireEvent(nativeModal, 'dismiss');
      expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
      fireEvent(nativeModal, 'dismiss');
      expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
    });

    it.each(['cancel', 'system back'] as const)(
      'restores launcher focus once after Android %s',
      (dismissal) => {
        jest.replaceProperty(Platform, 'OS', 'android');
        const setFocus = jest
          .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
          .mockImplementation(() => undefined);

        function Harness(): React.ReactNode {
          const [visible, setVisible] = React.useState(true);
          const triggerRef = React.useRef<View>(42 as unknown as View);
          return (
            <ConfirmDialog
              {...baseProps({
                visible,
                onCancel: () => setVisible(false),
                returnFocusRef: triggerRef,
              })}
            />
          );
        }

        const view = render(<Harness />);
        const nativeModal = view.UNSAFE_getByType(RNModal);
        const callsBeforeClose = setFocus.mock.calls.length;
        if (dismissal === 'cancel') {
          fireEvent.press(screen.getByTestId('dlg-cancel'));
        } else {
          fireEvent(nativeModal, 'requestClose');
        }

        expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
        fireEvent(nativeModal, 'dismiss');
        expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
      },
    );

    it('does not restore focus for an initially hidden Android dialog', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const setFocus = jest
        .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
        .mockImplementation(() => undefined);
      setFocus.mockClear();
      const triggerRef = { current: 42 as unknown as View };
      const view = render(
        <ConfirmDialog
          {...baseProps({ visible: false, returnFocusRef: triggerRef })}
        />,
      );

      expect(setFocus).not.toHaveBeenCalled();
      fireEvent(view.UNSAFE_getByType(RNModal), 'dismiss');
      expect(setFocus).not.toHaveBeenCalled();
    });

    it('exposes pending and failure state without allowing dismissal', () => {
      const onCancel = jest.fn();
      const view = render(
        <ConfirmDialog
          {...baseProps({
            isPending: true,
            errorMessage: 'Could not complete this action.',
            onCancel,
          })}
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Could not complete this action.');
      expect(screen.getByTestId('dlg-confirm')).toHaveAccessibilityState({
        disabled: true,
        busy: true,
      });
      fireEvent(screen.getByTestId('dlg'), 'accessibilityEscape');
      fireEvent(view.UNSAFE_getByType(RNModal), 'requestClose');
      expect(onCancel).not.toHaveBeenCalled();
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
      expect(screen.getByTestId('confirm-dialog-backdrop', { includeHiddenElements: true })).toBeTruthy();
    });
  });
});
