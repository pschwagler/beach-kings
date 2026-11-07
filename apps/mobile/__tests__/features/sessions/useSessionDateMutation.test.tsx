import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { SessionDetail } from '@beach-kings/shared';
import { useSessionDateMutation } from '@/features/sessions/useSessionDateMutation';
import { sessionKeys } from '@/features/sessions';

const mockUpdate = jest.fn();
jest.mock('@/lib/api', () => ({ api: { updateSession: (...args: unknown[]) => mockUpdate(...args) } }));
jest.mock('@/features/matches', () => ({ reconcileGameMutation: jest.fn().mockResolvedValue(undefined) }));

let client: QueryClient;
const session = { id: 1, league_id: 3, date: '2026-11-07' } as SessionDetail;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(sessionKeys.detail(7, 1), session);
  mockUpdate.mockReset().mockResolvedValue({ status: 'success' });
});
afterEach(() => { client.clear(); onlineManager.setOnline(true); });
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('writes only date, updates the existing session after confirmation and keeps unrelated fields', async () => {
  const { result } = renderHook(() => useSessionDateMutation(7, 1), { wrapper: Wrapper });
  await act(async () => { await result.current.mutateAsync('2026-11-08'); });
  expect(mockUpdate).toHaveBeenCalledWith(1, { date: '2026-11-08' });
  expect(client.getQueryData(sessionKeys.detail(7, 1))).toEqual({ ...session, date: '2026-11-08' });
});

it('never publishes a date that the server rejected', async () => {
  mockUpdate.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useSessionDateMutation(7, 1), { wrapper: Wrapper });
  await act(async () => { await result.current.mutateAsync('2026-11-08').catch(() => undefined); });
  expect(client.getQueryData(sessionKeys.detail(7, 1))).toEqual(session);
});

it('does not recreate cleared private data after a late response', async () => {
  let resolve!: (value: object) => void;
  mockUpdate.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useSessionDateMutation(7, 1), { wrapper: Wrapper });
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutateAsync('2026-11-08'); });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  client.clear();
  await act(async () => { resolve({ status: 'success' }); await write; });
  expect(client.getQueryData(sessionKeys.detail(7, 1))).toBeUndefined();
});

it('does not overwrite a later session snapshot', async () => {
  let resolve!: (value: object) => void;
  mockUpdate.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useSessionDateMutation(7, 1), { wrapper: Wrapper });
  let write!: Promise<unknown>;
  act(() => { write = result.current.mutateAsync('2026-11-08'); });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  client.setQueryData(sessionKeys.detail(7, 1), { ...session, date: '2026-11-09' });
  await act(async () => { resolve({ status: 'success' }); await write; });
  expect(client.getQueryData<SessionDetail>(sessionKeys.detail(7, 1))?.date).toBe('2026-11-09');
});

it('rejects offline without indefinitely pausing, preserves the date, and can retry online', async () => {
  onlineManager.setOnline(false);
  const { result } = renderHook(() => useSessionDateMutation(7, 1), { wrapper: Wrapper });
  await act(async () => { await result.current.mutateAsync('2026-11-08').catch(() => undefined); });
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(result.current.isPaused).toBe(false);
  expect(result.current.isPending).toBe(false);
  expect(client.getQueryData(sessionKeys.detail(7, 1))).toEqual(session);
  onlineManager.setOnline(true);
  await act(async () => { await result.current.mutateAsync('2026-11-08'); });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});
