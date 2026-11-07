import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { useLeaguePicture } from '@/features/leagues/useLeaguePicture';
import { leagueKeys } from '@/features/leagues/keys';

const mockGet = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/api', () => ({ api: {
  getLeaguePicture: (...args: unknown[]) => mockGet(...args),
  uploadLeaguePicture: (...args: unknown[]) => mockUpload(...args),
  removeLeaguePicture: (...args: unknown[]) => mockRemove(...args),
} }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
const initial = { data_uri: 'data:image/jpeg;base64,b2xk', revision: 'old' };
const updated = { data_uri: 'data:image/jpeg;base64,bmV3', revision: 'new' };
const file = { uri: 'file:///picture.jpg', name: 'picture.jpg', type: 'image/jpeg' };
let client: QueryClient;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockGet.mockReset().mockResolvedValue(initial);
  mockUpload.mockReset().mockResolvedValue(updated);
  mockRemove.mockReset().mockResolvedValue({ data_uri: null, revision: null });
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });

it('reads with cancellation and changes the member-scoped picture only after confirmation', async () => {
  let finish!: (value: typeof updated) => void;
  mockUpload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useLeaguePicture(7, 3, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  let request!: Promise<void>;
  act(() => { request = result.current.changePicture({ kind: 'upload', file }); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(3, file));
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toEqual(initial);
  expect(mockGet).toHaveBeenCalledWith(3, { signal: expect.any(AbortSignal) });
  await act(async () => { finish(updated); await request; });
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toEqual(updated);
});

it('serializes repeated activation without uploading twice', async () => {
  let finish!: (value: typeof updated) => void;
  mockUpload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useLeaguePicture(7, 3, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  let first!: Promise<void>;
  act(() => {
    first = result.current.changePicture({ kind: 'upload', file });
    void result.current.changePicture({ kind: 'upload', file });
  });
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  await act(async () => { finish(updated); await first; });
});

it('cancels a focus read that would overwrite the uploaded picture with old bytes', async () => {
  let finishUpload!: (value: typeof updated) => void;
  let finishRead!: (value: typeof initial) => void;
  mockUpload.mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
  const { result } = renderHook(() => useLeaguePicture(7, 3, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  let request!: Promise<void>;
  act(() => { request = result.current.changePicture({ kind: 'upload', file }); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
  mockGet.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  act(() => { void result.current.query.refetch(); });
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  await act(async () => { finishUpload(updated); await request; });
  await act(async () => { finishRead(initial); });
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toEqual(updated);
});

it('does not publish a late old-account response or permit an old-account callback', async () => {
  let finish!: (value: typeof updated) => void;
  mockUpload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useLeaguePicture(id, 3, true),
    { initialProps: { id: 7 }, wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  const oldCallback = result.current.changePicture;
  let request!: Promise<void>;
  act(() => { request = oldCallback({ kind: 'upload', file }); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
  rerender({ id: 8 });
  await act(async () => { finish(updated); await request; });
  expect(client.getQueryData(leagueKeys.picture(8, 3))).not.toEqual(updated);
  await expect(oldCallback({ kind: 'remove' })).rejects.toThrow('admin access');
  expect(mockRemove).not.toHaveBeenCalled();
});

it('does not resurrect a cleared picture cache after an upload', async () => {
  let finish!: (value: typeof updated) => void;
  mockUpload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, unmount } = renderHook(() => useLeaguePicture(7, 3, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  let request!: Promise<void>;
  act(() => { request = result.current.changePicture({ kind: 'upload', file }); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
  unmount(); client.clear();
  await act(async () => { finish(updated); await request; });
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toBeUndefined();
});

it('does not expose an old failed upload as a retry after an account or league change', async () => {
  mockUpload.mockRejectedValue(new Error('Upload failed'));
  const { result, rerender } = renderHook(({ id, league }) => useLeaguePicture(id, league, true),
    { initialProps: { id: 7, league: 3 }, wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  await act(async () => { await result.current.changePicture({ kind: 'upload', file }).catch(() => undefined); });
  expect(result.current.mutation.isError).toBe(true);
  expect(result.current.mutation.variables?.change).toEqual({ kind: 'upload', file });
  rerender({ id: 8, league: 4 });
  expect(result.current.mutation.isError).toBe(false);
  expect(result.current.mutation.error).toBeNull();
  expect(result.current.mutation.variables).toBeUndefined();
});

it('preserves the old picture on failure and retries online without a paused mutation', async () => {
  const { result } = renderHook(() => useLeaguePicture(7, 3, true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  onlineManager.setOnline(false);
  await act(async () => { await result.current.changePicture({ kind: 'upload', file }).catch(() => undefined); });
  expect(result.current.mutation.isPaused).toBe(false);
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toEqual(initial);
  expect(mockUpload).not.toHaveBeenCalled();
  onlineManager.setOnline(true);
  await act(async () => { await result.current.changePicture({ kind: 'upload', file }); });
  expect(client.getQueryData(leagueKeys.picture(7, 3))).toEqual(updated);
});
