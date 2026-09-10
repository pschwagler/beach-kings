import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { socialQueries } from '@/features/social/queries';
import { courtQueries } from '@/features/courts/queries';
import { matchKeys } from '@/features/matches/keys';
import { useMyGamesScreen } from '@/components/screens/Games/useMyGamesScreen';
import { assertRefreshResult } from '@/components/refresh/useExplicitRefresh';
import { isAccessRevokedError } from '@/lib/apiError';

let mockIdentity = 1;
const mockApi = {
  getPublicPlayer: jest.fn(), getMutualFriends: jest.fn(), getPlayerLeagues: jest.fn(),
  getCourtById: jest.fn(), getCourtPhotos: jest.fn(), getMyGames: jest.fn(),
};
jest.mock('@/lib/api', () => ({ get api() { return mockApi; } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockIdentity } }) }));

let client: QueryClient;
const previousProfile = {
  player: { id: 3, name: 'Player' },
  mutualFriends: [{ player_id: 7, full_name: 'Friend', avatar: null }],
  leagues: [{ id: 9, name: 'League', rank: null, games_played: 1 }],
};
beforeEach(() => {
  jest.clearAllMocks(); mockIdentity = 1;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());

it('preserves failed optional Profile sections on transient failure and reports incomplete refresh', async () => {
  const query = socialQueries.profile(1, 3);
  client.setQueryData(query.queryKey, previousProfile);
  mockApi.getPublicPlayer.mockResolvedValue({ id: 3 });
  mockApi.getMutualFriends.mockRejectedValue(new Error('offline'));
  mockApi.getPlayerLeagues.mockRejectedValue(new Error('timeout'));
  const data = await client.fetchQuery({ ...query, staleTime: 0 });
  expect(data.mutualFriends).toEqual(previousProfile.mutualFriends);
  expect(data.leagues).toEqual(previousProfile.leagues);
  expect(() => assertRefreshResult({ data })).toThrow();
});

it.each([401, 403, 404])('does not retain sensitive optional Profile data after HTTP %s', async status => {
  const query = socialQueries.profile(1, 3);
  client.setQueryData(query.queryKey, previousProfile);
  mockApi.getPublicPlayer.mockResolvedValue({ id: 3 });
  mockApi.getMutualFriends.mockRejectedValue({ response: { status } });
  mockApi.getPlayerLeagues.mockRejectedValue({ response: { status } });
  await expect(client.fetchQuery({ ...query, staleTime: 0 })).rejects.toMatchObject({ response: { status } });
  expect(isAccessRevokedError({ response: { status } })).toBe(true);
});

it('retains cached gallery header on transient error but removes it on revoked access', async () => {
  const query = courtQueries.photos(1, 'court');
  client.setQueryData(query.queryKey, { court: { id: 5, name: 'Court' }, photos: [{ id: 8, url: '/photo' }] });
  mockApi.getCourtPhotos.mockResolvedValue([{ id: 8 }]);
  mockApi.getCourtById.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce({ response: { status: 403 } });
  const first = await client.fetchQuery({ ...query, staleTime: 0 });
  expect(first.court).toEqual({ id: 5, name: 'Court' });
  expect(() => assertRefreshResult({ data: first })).toThrow();
  await expect(client.fetchQuery({ ...query, staleTime: 0 })).rejects.toMatchObject({ response: { status: 403 } });
});

it('prioritizes revoked optional access over a simultaneous primary transient failure', async () => {
  mockApi.getPublicPlayer.mockRejectedValue(new Error('offline'));
  mockApi.getMutualFriends.mockRejectedValue({ response: { status: 403 } });
  mockApi.getPlayerLeagues.mockResolvedValue([]);
  await expect(client.fetchQuery(socialQueries.profile(1, 3))).rejects.toMatchObject({ response: { status: 403 } });
  mockApi.getCourtPhotos.mockRejectedValue(new Error('offline'));
  mockApi.getCourtById.mockRejectedValue({ response: { status: 404 } });
  await expect(client.fetchQuery(courtQueries.photos(1, 'court'))).rejects.toMatchObject({ response: { status: 404 } });
});

it('My Games isolates filters/accounts and ignores a late obsolete result without a parallel cache', async () => {
  let finishOld!: (data: unknown) => void;
  mockApi.getMyGames.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValue({ games: [{ id: 2, partner_names: [], opponent_names: [] }] });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useMyGamesScreen(), { wrapper });
  await waitFor(() => expect(mockApi.getMyGames).toHaveBeenCalledTimes(1));
  const oldSignal = mockApi.getMyGames.mock.calls[0][1].signal as AbortSignal;
  act(() => hook.result.current.setResultFilter('W'));
  await waitFor(() => expect(hook.result.current.games[0]?.id).toBe(2));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOld({ games: [{ id: 99, partner_names: [], opponent_names: [] }] }));
  expect(hook.result.current.games[0]?.id).toBe(2);
  expect(client.getQueryData(matchKeys.myGames(1, null, 'W'))).toEqual({ games: [{ id: 2, partner_names: [], opponent_names: [] }] });
  expect(client.getQueryData(matchKeys.history(1, 1))).toBeUndefined();
  mockApi.getMyGames.mockImplementation(() => new Promise(() => undefined));
  mockIdentity = 2; hook.rerender({});
  expect(hook.result.current.games).toEqual([]);
  hook.unmount();
});
