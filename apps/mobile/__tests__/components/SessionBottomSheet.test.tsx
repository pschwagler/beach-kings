/**
 * Tests for SessionBottomSheet — focused on the Delete Session flow, which
 * calls the real api.deleteSession behind a destructive confirmation dialog.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockDeleteSession = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/api', () => ({
  api: {
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

jest.spyOn(Alert, 'alert');

// Module under test — imported AFTER all jest.mock() calls.
import SessionBottomSheet from '@/components/screens/Sessions/SessionBottomSheet';

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  sessionId: 42,
  sessionLabel: '3/19/2026 Session #1',
  gameCount: 5,
  playerCount: 4,
  status: 'active' as const,
};

/** Grab the onPress of a named button from the most recent Alert.alert call. */
function pressAlertButton(text: string): Promise<void> | void {
  const args = jest.mocked(Alert.alert).mock.calls.at(-1);
  const buttons = args?.[2] as
    | Array<{ text: string; onPress?: () => void | Promise<void> }>
    | undefined;
  const btn = buttons?.find((b) => b.text === text);
  return btn?.onPress?.();
}

describe('SessionBottomSheet — Delete Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('confirms before deleting and does not call the API on Cancel', async () => {
    const { getByTestId } = render(<SessionBottomSheet {...baseProps} />);
    fireEvent.press(getByTestId('session-menu-delete'));

    // The confirm dialog opens after an awaited haptic, so wait for it.
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Session',
        expect.stringContaining('permanently delete'),
        expect.any(Array),
      ),
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('deletes the session and navigates away on confirm', async () => {
    mockDeleteSession.mockResolvedValueOnce({ status: 'ok' });
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SessionBottomSheet {...baseProps} onClose={onClose} />,
    );

    fireEvent.press(getByTestId('session-menu-delete'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await pressAlertButton('Delete');

    await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith(42));
    expect(onClose).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/add-games');
  });

  it('surfaces an error alert and stays put when deletion fails', async () => {
    mockDeleteSession.mockRejectedValueOnce(new Error('network'));
    const { getByTestId } = render(<SessionBottomSheet {...baseProps} />);

    fireEvent.press(getByTestId('session-menu-delete'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await pressAlertButton('Delete');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not delete session',
        expect.any(String),
        expect.any(Array),
      ),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
