import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

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

  it('keeps details and reason after a structured API error and allows retry', async () => {
    mockMutateAsync.mockRejectedValueOnce({ response: { data: { detail: { code: 'failed' } } } });
    const onClose = jest.fn();
    const screen = render(<ReportSheet targetType="player" targetId={42} onClose={onClose} />);
    fireEvent.press(screen.getByText('Other'));
    fireEvent.changeText(screen.getByLabelText('Report details'), 'Please review this');
    fireEvent.press(screen.getByText('Submit report'));
    await screen.findByText('Could not submit this report. Please try again.');
    expect(screen.getByLabelText('Report details').props.value).toBe('Please review this');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Submit report'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('provides a scrolling keyboard-dismissible form and guards rapid submission', async () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {}));
    const screen = render(<ReportSheet targetType="player" targetId={42} onClose={jest.fn()} />);
    expect(screen.getByTestId('report-form-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('bottom-sheet-keyboard-avoider').props.enabled).toBe(true);
    expect(screen.getByTestId('report-dialog').props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByTestId('report-dialog').props.role).toBe('dialog');
    expect(screen.getByLabelText('Close report')).toBeTruthy();
    expect(screen.queryByLabelText('Dismiss keyboard')).toBeNull();
    fireEvent.press(screen.getByText('Other'));
    fireEvent.press(screen.getByText('Submit report'));
    fireEvent.press(screen.getByText('Submit report'));
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
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
    const screen = render(
      <ReportSheet targetType="player" targetId={42} onClose={onClose} />,
    );

    fireEvent.press(screen.getByText(label));
    fireEvent.press(screen.getByText('Submit report'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      target_type: 'player',
      target_id: 42,
      reason: wireValue,
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
