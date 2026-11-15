import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AccountModerationScreen from '@/components/screens/Settings/AccountModerationScreen';
import { api } from '@/lib/api';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 7,
      moderation_status: 'active',
      interaction_restricted_until: '2099-01-01T00:00:00Z',
      interaction_restriction_case_id: 12,
    },
    logout: jest.fn(),
    refreshUser: jest.fn(),
  }),
}));

jest.mock('@/components/ui/TopNav', () => () => null);
const mockMarkAsRead = jest.fn();
jest.mock('@/features/notifications', () => ({
  useNotifications: () => ({ markAsRead: mockMarkAsRead }),
}));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textMuted: '#777', textInverse: '#fff' }),
}));
jest.mock('@/lib/api', () => ({
  api: {
    getAccountModerationStatus: jest.fn(),
    createModerationAppeal: jest.fn(),
    scheduleAccountDeletion: jest.fn(),
  },
}));

describe('AccountModerationScreen', () => {
  beforeEach(() => mockMarkAsRead.mockClear());

  it('opens the requested warning, preserves private text, and keeps warnings in history', async () => {
    jest.mocked(api.getAccountModerationStatus).mockResolvedValue({
      account_status: 'active', account_expires_at: null, account_case_id: null,
      interaction_restricted_until: null, interaction_restriction_case_id: null,
      appeals: [], warnings: [
        { id: 21, message: 'Please stop sending unwanted messages.', created_at: '2026-09-16T12:00:00Z' },
        { id: 20, message: 'Follow the community guidelines.', created_at: '2026-09-15T12:00:00Z' },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = render(<QueryClientProvider client={client}>
      <AccountModerationScreen warningId="21" notificationId="42" />
    </QueryClientProvider>);

    expect(await screen.findByText('Please stop sending unwanted messages.')).toBeTruthy();
    expect(screen.getByText('Follow the community guidelines.')).toBeTruthy();
    expect(screen.queryByText('Private policy basis')).toBeNull();
    await waitFor(() => expect(mockMarkAsRead).toHaveBeenCalledWith(42));
  });

  it('offers retry and leaves the notification unread when the warning cannot load', async () => {
    jest.mocked(api.getAccountModerationStatus).mockRejectedValue(new Error('offline'));
    const recoveredStatus = { account_status: 'active' as const, account_expires_at: null,
        account_case_id: null, interaction_restricted_until: null,
        interaction_restriction_case_id: null, appeals: [], warnings: [
          { id: 21, message: 'Please stop sending unwanted messages.', created_at: '2026-09-16T12:00:00Z' },
        ] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = render(<QueryClientProvider client={client}>
      <AccountModerationScreen warningId="21" notificationId="42" />
    </QueryClientProvider>);

    expect(await screen.findByText('Warning unavailable')).toBeTruthy();
    expect(mockMarkAsRead).not.toHaveBeenCalled();
    jest.mocked(api.getAccountModerationStatus).mockResolvedValue(recoveredStatus);
    fireEvent.press(screen.getByText('Retry warning'));
    expect(await screen.findByText('Please stop sending unwanted messages.')).toBeTruthy();
    await waitFor(() => expect(mockMarkAsRead).toHaveBeenCalledWith(42));
  });

  it('does not consume a second warning from cache before its refresh succeeds', async () => {
    const status = { account_status: 'active' as const, account_expires_at: null,
      account_case_id: null, interaction_restricted_until: null,
      interaction_restriction_case_id: null, appeals: [], warnings: [
        { id: 21, message: 'First warning', created_at: '2026-09-16T12:00:00Z' },
        { id: 22, message: 'Second warning', created_at: '2026-09-16T13:00:00Z' },
      ] };
    jest.mocked(api.getAccountModerationStatus).mockResolvedValue(status);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = (warningId: string, notificationId: string) => <QueryClientProvider client={client}>
      <AccountModerationScreen warningId={warningId} notificationId={notificationId} />
    </QueryClientProvider>;
    const screen = render(first('21', '42'));
    await waitFor(() => expect(mockMarkAsRead).toHaveBeenCalledWith(42));
    mockMarkAsRead.mockClear();
    jest.mocked(api.getAccountModerationStatus).mockRejectedValue(new Error('offline'));

    screen.rerender(first('22', '43'));
    expect(await screen.findByText('Warning unavailable')).toBeTruthy();
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it('keeps cached warnings visible and offers retry after manual refresh fails', async () => {
    const cachedStatus = {
      account_status: 'active' as const,
      account_expires_at: null,
      account_case_id: null,
      interaction_restricted_until: null,
      interaction_restriction_case_id: null,
      appeals: [],
      warnings: [{
        id: 21,
        message: 'Keep this viewer-safe warning visible.',
        created_at: '2026-09-16T12:00:00Z',
      }],
    };
    jest.mocked(api.getAccountModerationStatus)
      .mockResolvedValueOnce(cachedStatus)
      .mockRejectedValueOnce(new Error('offline'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <AccountModerationScreen />
      </QueryClientProvider>,
    );
    expect(await view.findByText('Keep this viewer-safe warning visible.')).toBeTruthy();

    fireEvent.press(view.getByText('Refresh status'));

    expect(await view.findByText('Account status may be out of date')).toBeTruthy();
    expect(view.getByText('Keep this viewer-safe warning visible.')).toBeTruthy();
    let finishRetry!: (value: typeof cachedStatus) => void;
    jest.mocked(api.getAccountModerationStatus).mockReturnValue(new Promise((resolve) => {
      finishRetry = resolve;
    }));
    const recoveredStatus = {
      ...cachedStatus,
      warnings: [{
        id: 22,
        message: 'Recovered warning history.',
        created_at: '2026-09-17T12:00:00Z',
      }],
    };

    fireEvent.press(view.getByText('Retry refresh'));

    expect(await view.findByText('Retrying refresh…')).toBeTruthy();
    expect(view.getByLabelText('Retry refreshing account status').props.accessibilityState)
      .toEqual({ busy: true, disabled: true });
    await act(async () => { finishRetry(recoveredStatus); });

    expect(await view.findByText('Recovered warning history.')).toBeTruthy();
    await waitFor(() => {
      expect(view.queryByText('Account status may be out of date')).toBeNull();
    });
  });

  it('shows an upheld appeal as final instead of offering a broken repeat form', async () => {
    jest.mocked(api.getAccountModerationStatus).mockResolvedValue({
      account_status: 'active',
      account_expires_at: null,
      account_case_id: null,
      interaction_restricted_until: '2099-01-01T00:00:00Z',
      interaction_restriction_case_id: 12,
      appeals: [{
        id: 4,
        case_id: 12,
        status: 'upheld',
        statement: 'Please reconsider this decision.',
        resolution_reason: 'The restriction remains proportionate to the reviewed conduct.',
        created_at: '2026-08-05T12:00:00Z',
        resolved_at: '2026-08-06T12:00:00Z',
      }],
      warnings: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const screen = render(
      <QueryClientProvider client={client}>
        <AccountModerationScreen />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Decision upheld')).toBeTruthy();
    expect(screen.getByText('The restriction remains proportionate to the reviewed conduct.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId('moderation-appeal-input')).toBeNull();
    });
  });
});
