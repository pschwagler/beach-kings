import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import type { PlayerSearchResponse } from '@beach-kings/shared';
import { createPlayerMethods } from '../../../../packages/api-client/src/playerMethods';
import { sessionQueries } from '@/features/sessions';
import { useScoreGameScreen } from '@/components/screens/Games/useScoreGameScreen';

const mockSearchPlayers = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { searchPlayers: (...args: unknown[]) => mockSearchPlayers(...args) },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
jest.mock('@/contexts/AddNewPlayerContext', () => ({
  useAddNewPlayer: () => ({ result: null, setRequest: jest.fn(), consumeResult: () => null }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));

const roster: PlayerSearchResponse = {
  items: [{
    id: 1, first_name: 'Alex', last_name: 'Beach', full_name: 'Alex Beach',
    nickname: null, initials: 'AB', tags: [], score: 1, in_session: false, is_guest: false,
  }],
};
const latestResults: PlayerSearchResponse = {
  items: [{ ...roster.items[0]!, id: 2, first_name: 'Blair', full_name: 'Blair Beach' }],
};
interface PendingSearch {
  readonly signal: AbortSignal | undefined;
  readonly resolve: (response: { data: PlayerSearchResponse }) => void;
}
let requests: Map<string, PendingSearch>;
let client: QueryClient;
let transport: jest.Mock;

beforeEach(() => {
  requests = new Map();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  // Use the real API adapter. The fake transport deliberately allows late
  // responses, so cancellation must both abort it and ignore its result.
  transport = jest.fn((_url: string, config: { params: { q: string }; signal?: AbortSignal }) => {
    if (config.params.q === '') return Promise.resolve({ data: roster });
    return new Promise<{ data: PlayerSearchResponse }>((resolve) => {
      requests.set(config.params.q, { signal: config.signal, resolve });
    });
  });
  mockSearchPlayers.mockImplementation(
    createPlayerMethods({ get: transport } as unknown as AxiosInstance).searchPlayers,
  );
});

afterEach(() => client.clear());

function renderSearch() {
  return renderHook(() => useScoreGameScreen({ currentPlayerId: 77 }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

it('aborts an obsolete search immediately and keeps newer results when the old response arrives late', async () => {
  const { result } = renderSearch();
  await waitFor(() => expect(result.current.roster).toHaveLength(1));
  act(() => result.current.setSearch('Alex'));
  await waitFor(() => expect(requests.has('Alex')).toBe(true));
  const old = requests.get('Alex')!;

  act(() => result.current.setSearch('Blair'));
  await waitFor(() => expect(old.signal?.aborted).toBe(true));
  // Cancellation happens before the replacement's 250ms debounce expires.
  expect(requests.has('Blair')).toBe(false);
  expect(result.current.isSearching).toBe(true);
  await waitFor(() => expect(requests.has('Blair')).toBe(true));
  await act(async () => requests.get('Blair')!.resolve({ data: latestResults }));
  await waitFor(() => expect(result.current.filteredRoster[0]?.player_id).toBe(2));
  await act(async () => old.resolve({ data: roster }));

  expect(result.current.filteredRoster[0]?.player_id).toBe(2);
  expect(result.current.errorMessage).toBeNull();
  expect(result.current.isSearching).toBe(false);
});

it('cancels on clear and restores the default roster without losing the score draft', async () => {
  const { result } = renderSearch();
  await waitFor(() => expect(result.current.roster).toHaveLength(1));
  act(() => {
    result.current.setScore1(21);
    result.current.setSearch('Blair');
  });
  await waitFor(() => expect(requests.has('Blair')).toBe(true));
  const pending = requests.get('Blair')!;
  act(() => result.current.setSearch(''));
  await waitFor(() => expect(pending.signal?.aborted).toBe(true));

  expect(result.current.filteredRoster[0]?.player_id).toBe(1);
  expect(result.current.score1).toBe(21);
  expect(result.current.isSearching).toBe(false);
  expect(result.current.submitState).toBe('idle');
  expect(transport.mock.calls.filter(([, config]) => config.params.q === '')).toHaveLength(1);
});

it('cancels a pending search when the screen unmounts', async () => {
  const { result, unmount } = renderSearch();
  act(() => result.current.setSearch('Alex'));
  await waitFor(() => expect(requests.has('Alex')).toBe(true));
  const pending = requests.get('Alex')!;
  unmount();
  expect(pending.signal?.aborted).toBe(true);
});

it('keeps a shared search alive until its final consumer leaves', async () => {
  const { result } = renderSearch();
  act(() => result.current.setSearch('Alex'));
  await waitFor(() => expect(requests.has('Alex')).toBe(true));
  const pending = requests.get('Alex')!;
  const observer = new QueryObserver(client, sessionQueries.playerSearch(7, null, 'Alex'));
  const unsubscribe = observer.subscribe(() => undefined);

  act(() => result.current.setSearch(''));
  expect(pending.signal?.aborted).toBe(false);
  unsubscribe();
  expect(pending.signal?.aborted).toBe(true);
});
