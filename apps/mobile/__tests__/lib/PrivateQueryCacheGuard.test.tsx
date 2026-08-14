import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivateQueryCacheGuard } from '@/infrastructure/query';

let mockAuthState = {
  user: { id: 1 } as { id: number } | null,
  isAuthenticated: true,
  isLoading: false,
};

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

function tree(client: QueryClient): React.ReactElement {
  return (
    <QueryClientProvider client={client}>
      <PrivateQueryCacheGuard>
        <Text>content</Text>
      </PrivateQueryCacheGuard>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockAuthState = {
    user: { id: 1 },
    isAuthenticated: true,
    isLoading: false,
  };
});

describe('PrivateQueryCacheGuard', () => {
  it('removes retained private data on logout', async () => {
    const client = new QueryClient();
    client.setQueryData(['social', 1, 'friends'], [{ player_id: 4 }]);
    const view = render(tree(client));

    act(() => {
      mockAuthState = { user: null, isAuthenticated: false, isLoading: false };
      view.rerender(tree(client));
    });

    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
  });

  it('removes the previous account cache on an account switch', async () => {
    const client = new QueryClient();
    client.setQueryData(['notifications', 1, 'feed'], [{ id: 8 }]);
    const view = render(tree(client));

    act(() => {
      mockAuthState = {
        user: { id: 2 },
        isAuthenticated: true,
        isLoading: false,
      };
      view.rerender(tree(client));
    });

    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
  });
});
