import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlayerProfileMutations } from '@/features/player';
import { playerKeys } from '@/features/player/keys';
import { api } from '@/lib/api';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    updatePlayerProfile: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
  },
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(playerKeys.me(7), {
    id: 42,
    name: 'Pat Player',
    full_name: 'Pat Player',
    city: 'Brooklyn',
    profile_picture_url: null,
    stats: { total_games: 9 },
  });
  function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return { client, Wrapper };
}

describe('usePlayerProfileMutations', () => {
  it('merges a partial profile response without dropping cached stats', async () => {
    (api.updatePlayerProfile as jest.Mock).mockResolvedValue({
      id: 42,
      name: 'Pat King',
      full_name: 'Pat King',
      city: 'Queens',
    });
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.updateProfile.mutateAsync({
        full_name: 'Pat King',
        city: 'Queens',
      });
    });

    await waitFor(() => expect(
      client.getQueryData(playerKeys.me(7)),
    ).toMatchObject({
      full_name: 'Pat King',
      city: 'Queens',
      stats: { total_games: 9 },
    }));
  });

  it('updates the shared current-player photo immediately after upload', async () => {
    (api.uploadAvatar as jest.Mock).mockResolvedValue({
      profile_picture_url: 'https://cdn.example.com/pat.jpg',
    });
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.uploadAvatar.mutateAsync({
        uri: 'file:///avatar.jpg',
        name: 'avatar.jpg',
        type: 'image/jpeg',
      });
    });

    await waitFor(() => expect(
      client.getQueryData(playerKeys.me(7)),
    ).toMatchObject({
      avatar: 'https://cdn.example.com/pat.jpg',
      profile_picture_url: 'https://cdn.example.com/pat.jpg',
    }));
  });
});
