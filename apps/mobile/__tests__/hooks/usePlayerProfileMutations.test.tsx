import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { usePlayerProfileMutations } from '@/features/player';
import { playerKeys } from '@/features/player/keys';
import { playerQueries } from '@/features/player/queries';
import { api } from '@/lib/api';

let mockUserId = 7;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    updatePlayerProfile: jest.fn(),
    getCurrentUserPlayer: jest.fn(),
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
  beforeEach(() => {
    mockUserId = 7;
    jest.clearAllMocks();
  });

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

  it('converges every current-player query observer on the uploaded URL', async () => {
    const uploaded = 'https://cdn.example.com/shared.jpg';
    (api.uploadAvatar as jest.Mock).mockResolvedValue({
      profile_picture_url: uploaded,
    });
    (api.getCurrentUserPlayer as jest.Mock).mockResolvedValue({
      id: 42,
      name: 'Pat Player',
      avatar: uploaded,
      profile_picture_url: uploaded,
    });
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({
        profileSurface: useQuery(playerQueries.me(7)),
        homeSurface: useQuery(playerQueries.me(7)),
        mutations: usePlayerProfileMutations(),
      }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutations.uploadAvatar.mutateAsync({
        uri: 'file:///shared.jpg',
        name: 'shared.jpg',
        type: 'image/jpeg',
      });
    });

    await waitFor(() => {
      expect(result.current.profileSurface.data?.profile_picture_url).toBe(uploaded);
      expect(result.current.homeSurface.data?.profile_picture_url).toBe(uploaded);
    });
  });

  it('uses the latest distinct URL after rapid sequential replacements', async () => {
    (api.uploadAvatar as jest.Mock)
      .mockResolvedValueOnce({
        profile_picture_url: 'https://cdn.example.com/first.jpg',
      })
      .mockResolvedValueOnce({
        profile_picture_url: 'https://cdn.example.com/second.jpg',
      });
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.uploadAvatar.mutateAsync({
        uri: 'file:///first.jpg',
        name: 'first.jpg',
        type: 'image/jpeg',
      });
      await result.current.uploadAvatar.mutateAsync({
        uri: 'file:///second.jpg',
        name: 'second.jpg',
        type: 'image/jpeg',
      });
    });

    expect(client.getQueryData(playerKeys.me(7))).toMatchObject({
      avatar: 'https://cdn.example.com/second.jpg',
      profile_picture_url: 'https://cdn.example.com/second.jpg',
    });
  });

  it('preserves the prior photo when upload fails', async () => {
    (api.uploadAvatar as jest.Mock).mockRejectedValue(new Error('upload failed'));
    const { client, Wrapper } = setup();
    client.setQueryData(playerKeys.me(7), {
      ...(client.getQueryData(playerKeys.me(7)) as object),
      avatar: 'https://cdn.example.com/old.jpg',
      profile_picture_url: 'https://cdn.example.com/old.jpg',
    });
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.uploadAvatar.mutateAsync({
          uri: 'file:///bad.jpg',
          name: 'bad.jpg',
          type: 'image/jpeg',
        }),
      ).rejects.toThrow('upload failed');
    });

    expect(client.getQueryData(playerKeys.me(7))).toMatchObject({
      avatar: 'https://cdn.example.com/old.jpg',
      profile_picture_url: 'https://cdn.example.com/old.jpg',
    });
  });

  it('removes both current-player photo fields after deletion', async () => {
    (api.deleteAvatar as jest.Mock).mockResolvedValue({
      message: 'Avatar removed',
    });
    const { client, Wrapper } = setup();
    client.setQueryData(playerKeys.me(7), {
      ...(client.getQueryData(playerKeys.me(7)) as object),
      avatar: 'https://cdn.example.com/old.jpg',
      profile_picture_url: 'https://cdn.example.com/old.jpg',
    });
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.deleteAvatar.mutateAsync();
    });

    expect(client.getQueryData(playerKeys.me(7))).toMatchObject({
      avatar: null,
      profile_picture_url: null,
    });
  });

  it('updates only the authenticated account avatar cache', async () => {
    mockUserId = 8;
    (api.uploadAvatar as jest.Mock).mockResolvedValue({
      profile_picture_url: 'https://cdn.example.com/user-8.jpg',
    });
    const { client, Wrapper } = setup();
    client.setQueryData(playerKeys.me(8), {
      id: 84,
      name: 'Other Player',
      profile_picture_url: null,
    });
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.uploadAvatar.mutateAsync({
        uri: 'file:///other.jpg',
        name: 'other.jpg',
        type: 'image/jpeg',
      });
    });

    expect(client.getQueryData(playerKeys.me(8))).toMatchObject({
      profile_picture_url: 'https://cdn.example.com/user-8.jpg',
    });
    expect(client.getQueryData(playerKeys.me(7))).toMatchObject({
      profile_picture_url: null,
    });
  });

  it('refetches the persisted latest URL after cache recreation', async () => {
    const latest = 'https://cdn.example.com/latest.jpg';
    (api.uploadAvatar as jest.Mock).mockResolvedValue({
      profile_picture_url: latest,
    });
    (api.getCurrentUserPlayer as jest.Mock).mockResolvedValue({
      id: 42,
      name: 'Pat Player',
      avatar: latest,
      profile_picture_url: latest,
    });
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => usePlayerProfileMutations(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.uploadAvatar.mutateAsync({
        uri: 'file:///latest.jpg',
        name: 'latest.jpg',
        type: 'image/jpeg',
      });
    });

    client.clear();
    const relaunched = await client.fetchQuery(playerQueries.me(7));

    expect(relaunched).toMatchObject({
      avatar: latest,
      profile_picture_url: latest,
    });
  });
});
