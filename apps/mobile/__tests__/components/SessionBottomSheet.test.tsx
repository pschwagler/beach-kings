/**
 * Tests for SessionBottomSheet — focused on the Delete Session flow, which
 * calls the real api.deleteSession behind a destructive confirmation dialog.
 */

import React from 'react';
import { Alert, Share } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme as render } from '../../test-utils/renderWithTheme';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

const mockReplace = jest.fn();
const mockDeleteSession = jest.fn();
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('nativewind', () => ({
  useColorScheme: () => ({
    colorScheme: 'light',
    setColorScheme: jest.fn(),
  }),
  vars: (values: object) => values,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

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
jest.spyOn(Share, 'share');

// Module under test — imported AFTER all jest.mock() calls.
import SessionBottomSheet from '@/components/screens/Sessions/SessionBottomSheet';

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  sessionId: 42,
  sessionCode: 'BK42TEST',
  sessionLabel: '3/19/2026 Session #1',
  gameCount: 5,
  playerCount: 4,
  status: 'active' as const,
};

describe('SessionBottomSheet — Share Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Share.share).mockResolvedValue({
      action: Share.sharedAction,
      activityType: null,
    });
  });

  it('opens the native share sheet with a stable session URL', async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SessionBottomSheet {...baseProps} onClose={onClose} />,
    );

    fireEvent.press(getByTestId('session-menu-share'));

    await waitFor(() =>
      expect(Share.share).toHaveBeenCalledWith(
        {
          title: 'Share Session',
          message: expect.stringContaining(
            `${PUBLIC_WEB_ORIGIN}/session/BK42TEST`,
          ),
          url: `${PUBLIC_WEB_ORIGIN}/session/BK42TEST`,
        },
        { dialogTitle: 'Share Session' },
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a clear error and keeps the menu open without a session code', async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SessionBottomSheet
        {...baseProps}
        sessionCode={null}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId('session-menu-share'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not share session',
        expect.stringContaining('share code'),
        expect.any(Array),
      ),
    );
    expect(Share.share).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a product error if the native share sheet fails', async () => {
    jest.mocked(Share.share).mockRejectedValueOnce(new Error('unavailable'));
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SessionBottomSheet {...baseProps} onClose={onClose} />,
    );

    fireEvent.press(getByTestId('session-menu-share'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not share session',
        expect.stringContaining('could not be opened'),
        expect.any(Array),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

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
    await act(async () => {
      await pressAlertButton('Delete');
    });

    await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith(42));
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/add-games');
  });

  it('surfaces an error alert and stays put when deletion fails', async () => {
    mockDeleteSession.mockRejectedValueOnce(
      Object.assign(new Error('server error'), { response: { status: 500 } }),
    );
    const { getByTestId } = render(<SessionBottomSheet {...baseProps} />);

    fireEvent.press(getByTestId('session-menu-delete'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await act(async () => {
      await pressAlertButton('Delete');
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not delete session',
        expect.any(String),
        expect.any(Array),
      ),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'Sign in to delete session', 'session has expired'],
    [403, 'Not allowed to delete session', 'permission'],
    [404, 'Session not found', 'no longer exists'],
  ])(
    'maps HTTP %i without closing or navigating',
    async (status, expectedTitle, expectedMessage) => {
      mockDeleteSession.mockRejectedValueOnce(
        Object.assign(new Error('request failed'), { response: { status } }),
      );
      const onClose = jest.fn();
      const { getByTestId } = render(
        <SessionBottomSheet {...baseProps} onClose={onClose} />,
      );

      fireEvent.press(getByTestId('session-menu-delete'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await act(async () => {
        await pressAlertButton('Delete');
      });

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenLastCalledWith(
          expectedTitle,
          expect.stringContaining(expectedMessage),
          expect.any(Array),
        ),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    },
  );

  it('shows a connectivity-specific retry message and stays put', async () => {
    mockDeleteSession.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { request: {} }),
    );
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SessionBottomSheet {...baseProps} onClose={onClose} />,
    );

    fireEvent.press(getByTestId('session-menu-delete'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await act(async () => {
      await pressAlertButton('Delete');
    });

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Connection problem',
        expect.stringContaining('connection'),
        expect.any(Array),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
