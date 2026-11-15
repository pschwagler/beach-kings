import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Keyboard, Modal as RNModal, Platform, View } from 'react-native';

import ReportSheet from '@/components/moderation/ReportSheet';

const mockMutateAsync = jest.fn();
let mockKeyboardVisible = false;
jest.mock('@/hooks/useKeyboard', () => ({ __esModule: true, default: () => ({ isVisible: mockKeyboardVisible, keyboardHeight: mockKeyboardVisible ? 300 : 0 }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

jest.mock('@/features/moderation', () => ({
  useModerationMutations: () => ({
    report: { mutateAsync: mockMutateAsync, isPending: false },
  }),
}));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textMuted: '#777', textDefault: '#111' }),
}));

describe('ReportSheet urgent report reasons', () => {
  beforeEach(() => { mockKeyboardVisible = false; mockMutateAsync.mockReset().mockResolvedValue({}); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('keeps details and reason after a structured API error and allows retry', async () => {
    mockMutateAsync.mockRejectedValueOnce({ response: { data: { detail: { code: 'failed' } } } });
    const onClose = jest.fn();
    const view = render(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    fireEvent.press(view.getByText('Other'));
    fireEvent.changeText(view.getByLabelText('Report details'), 'Please review this');
    fireEvent.press(view.getByText('Submit report'));
    await view.findByText('Could not submit this report. Please try again.');
    expect(view.getByLabelText('Report details').props.value).toBe('Please review this');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Submit report'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
    expect(onClose).not.toHaveBeenCalled();
    const nativeModal = view.UNSAFE_getByType(RNModal);
    expect(nativeModal.props.visible).toBe(false);
    fireEvent(nativeModal, 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('provides a scrolling keyboard-dismissible form and guards rapid submission', async () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {}));
    const screen = render(<ReportSheet targetType="player" targetId={42} onClose={jest.fn()} />);
    expect(screen.getByTestId('report-form-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('bottom-sheet-keyboard-avoider').props.enabled).toBe(true);
    expect(screen.getByTestId('report-dialog').props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByTestId('report-dialog').props.role).toBe('dialog');
    expect(screen.getByRole('header')).toHaveProp('accessibilityLabel', 'Report');
    expect(screen.getByLabelText('Close report')).toBeTruthy();
    expect(screen.queryByLabelText('Dismiss keyboard')).toBeNull();
    fireEvent.press(screen.getByText('Other'));
    fireEvent.press(screen.getByText('Submit report'));
    fireEvent.press(screen.getByText('Submit report'));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('restores launcher focus once after native dismissal, never while closing', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    const onClose = jest.fn();
    const returnFocusRef = { current: 42 as unknown as View };
    const view = render(
      <ReportSheet
        targetType="player"
        targetId={42}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      />,
    );
    const callsBeforeClose = setFocus.mock.calls.length;

    fireEvent.press(view.getByLabelText('Close report'));
    expect(onClose).not.toHaveBeenCalled();
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose);

    const nativeModal = view.UNSAFE_getByType(RNModal);
    expect(nativeModal.props.visible).toBe(false);
    fireEvent(nativeModal, 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
    fireEvent(nativeModal, 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
  });

  it.each(['explicit close', 'system back'] as const)(
    'finalizes Android %s once without waiting for onDismiss',
    (dismissal) => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const setFocus = jest
        .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
        .mockImplementation(() => undefined);
      const onClose = jest.fn();
      const returnFocusRef = { current: 42 as unknown as View };
      const view = render(
        <ReportSheet
          targetType="player"
          targetId={42}
          onClose={onClose}
          returnFocusRef={returnFocusRef}
        />,
      );
      const nativeModal = view.UNSAFE_getByType(RNModal);
      const callsBeforeClose = setFocus.mock.calls.length;

      if (dismissal === 'explicit close') {
        fireEvent.press(view.getByLabelText('Close report'));
      } else {
        fireEvent(nativeModal, 'requestClose');
      }

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
      fireEvent(nativeModal, 'dismiss');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(setFocus).toHaveBeenCalledTimes(callsBeforeClose + 1);
    },
  );

  it('finalizes a successful Android submission and announces it once', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const setFocus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    const onClose = jest.fn();
    const onSubmitted = jest.fn();
    const returnFocusRef = { current: 42 as unknown as View };
    const view = render(
      <ReportSheet
        targetType="player"
        targetId={42}
        onClose={onClose}
        onSubmitted={onSubmitted}
        returnFocusRef={returnFocusRef}
      />,
    );
    const nativeModal = view.UNSAFE_getByType(RNModal);
    const callsBeforeSubmit = setFocus.mock.calls.length;

    fireEvent.press(view.getByText('Other'));
    fireEvent.press(view.getByText('Submit report'));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeSubmit + 1);
    fireEvent(nativeModal, 'dismiss');
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(callsBeforeSubmit + 1);
  });

  it('keeps multiline draft and selected reason through keyboard dismissal and reopening', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const onClose = jest.fn();
    const screen = render(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    const draft = 'First line\nSecond line\nThird line';
    fireEvent.press(screen.getByText('Other'));
    fireEvent.changeText(screen.getByLabelText('Report details'), draft);
    mockKeyboardVisible = true;
    screen.rerender(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    const footer = within(screen.getByTestId('report-actions'));
    expect(footer.getByText('Submit report')).toBeTruthy();
    fireEvent.press(footer.getByLabelText('Dismiss keyboard'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    mockKeyboardVisible = false;
    screen.rerender(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    expect(screen.queryByLabelText('Dismiss keyboard')).toBeNull();
    expect(screen.getByLabelText('Report details').props.value).toBe(draft);
    mockKeyboardVisible = true;
    screen.rerender(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    fireEvent.press(screen.getByText('Submit report'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      target_type: 'player', target_id: 42, reason: 'other', details: draft,
    }));
    dismiss.mockRestore();
  });

  it.each([
    ['Stalking or doxxing', 'stalking_doxxing'],
    ['Sexual exploitation', 'sexual_exploitation'],
  ])('submits %s with the stable wire value', async (label, wireValue) => {
    const onClose = jest.fn();
    const onSubmitted = jest.fn();
    const view = render(
      <ReportSheet
        targetType="player"
        targetId={42}
        onClose={onClose}
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.press(view.getByText(label));
    fireEvent.press(view.getByText('Submit report'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      target_type: 'player',
      target_id: 42,
      reason: wireValue,
    }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    fireEvent(view.UNSAFE_getByType(RNModal), 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });
});
