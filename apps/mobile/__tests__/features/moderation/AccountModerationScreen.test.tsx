import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AccountModerationScreen from '@/components/screens/Settings/AccountModerationScreen';
import { api } from '@/lib/api';

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
