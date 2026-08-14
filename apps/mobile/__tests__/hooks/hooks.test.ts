/**
 * Tests for custom hooks: useDebounce, useApi, useInfiniteList,
 * usePullToRefresh, useKeyboard, useRefreshOnFocus.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

import useDebounce from '@/hooks/useDebounce';
import useApi from '@/hooks/useApi';
import useInfiniteList from '@/hooks/useInfiniteList';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import useKeyboard from '@/hooks/useKeyboard';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Function) => { cb(); },
}));

// ---------------------------------------------------------------------------
// useDebounce
// ---------------------------------------------------------------------------
describe('useDebounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('returns debounced value after delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'hello' } },
    );

    rerender({ value: 'world' });
    expect(result.current).toBe('hello');

    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('world');
  });
});

// ---------------------------------------------------------------------------
// useApi
// ---------------------------------------------------------------------------
describe('useApi', () => {
  it('returns loading=true initially when enabled', () => {
    const fetcher = jest.fn(() => new Promise<string>(() => {}));
    const { result } = renderHook(() => useApi(fetcher, []));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns data after fetcher resolves', async () => {
    const fetcher = jest.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.error).toBeNull();
  });

  it('returns error when fetcher rejects', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useApi(fetcher, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toEqual(new Error('fetch failed'));
    expect(result.current.data).toBeUndefined();
  });

  it('re-calls fetcher on refetch', async () => {
    const fetcher = jest.fn().mockResolvedValue('first');
    const { result } = renderHook(() => useApi(fetcher, []));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetcher.mockResolvedValue('second');
    await act(async () => { await result.current.refetch(); });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('second');
  });

  it('does not fetch when enabled=false', () => {
    const fetcher = jest.fn().mockResolvedValue('data');
    const { result } = renderHook(() =>
      useApi(fetcher, [], { enabled: false }),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useInfiniteList
// ---------------------------------------------------------------------------
describe('useInfiniteList', () => {
  it('returns loading=true initially', () => {
    const fetcher = jest.fn(() => new Promise<string[]>(() => {}));
    const { result } = renderHook(() => useInfiniteList(fetcher));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('loads first page on mount', async () => {
    const fetcher = jest.fn().mockResolvedValue(['a', 'b', 'c']);
    const { result } = renderHook(() =>
      useInfiniteList(fetcher, { pageSize: 3 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(['a', 'b', 'c']);
    expect(fetcher).toHaveBeenCalledWith(1, 3);
  });

  it('appends items on loadMore', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(['a', 'b'])
      .mockResolvedValueOnce(['c', 'd']);

    const { result } = renderHook(() =>
      useInfiniteList(fetcher, { pageSize: 2 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    expect(result.current.data).toEqual(['a', 'b', 'c', 'd']);
    expect(fetcher).toHaveBeenCalledWith(2, 2);
  });

  it('sets hasMore=false when last page is shorter than pageSize', async () => {
    const fetcher = jest.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() =>
      useInfiniteList(fetcher, { pageSize: 5 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePullToRefresh
// ---------------------------------------------------------------------------
describe('usePullToRefresh', () => {
  it('returns refreshing=false initially', () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(refetch));
    expect(result.current.refreshing).toBe(false);
  });

  it('sets refreshing=true during onRefresh then back to false', async () => {
    let resolve!: () => void;
    const refetch = jest.fn(
      () => new Promise<void>((res) => { resolve = res; }),
    );

    const { result } = renderHook(() => usePullToRefresh(refetch));

    act(() => { result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(true);

    await act(async () => { resolve(); });
    expect(result.current.refreshing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useKeyboard — smoke test (Keyboard events not easily simulated in Jest)
// ---------------------------------------------------------------------------
describe('useKeyboard', () => {
  it('returns isVisible=false and keyboardHeight=0 initially', () => {
    const { result } = renderHook(() => useKeyboard());
    expect(result.current.isVisible).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useRefreshOnFocus — smoke test
// ---------------------------------------------------------------------------
describe('useRefreshOnFocus', () => {
  it('does not crash and calls refetch on focus', () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    expect(() => renderHook(() => useRefreshOnFocus(refetch, 0))).not.toThrow();
    expect(refetch).toHaveBeenCalled();
  });
});
