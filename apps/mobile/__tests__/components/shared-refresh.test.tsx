import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { Alert, AppState, FlatList, Platform, RefreshControl, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useExplicitRefresh, REFRESH_BUDGET_MS } from '@/components/refresh/useExplicitRefresh';
import RefreshFlatList from '@/components/refresh/RefreshFlatList';
import RefreshScrollView from '@/components/refresh/RefreshScrollView';
import ChatView from '@/components/ui/ChatView';

const mockBlurs: Array<() => void> = [];
let mockUserId = 1;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const blur = callback();
      mockBlurs.push(blur);
      return blur;
    }, [callback]);
  },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
jest.mock('@/theme/usePaletteColors', () => ({ usePaletteColors: () => ({ brandTeal: 'teal' }) }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: { children: React.ReactNode }) => children,
  useReanimatedKeyboardAnimation: () => ({ progress: { value: 0 }, height: { value: 0 } }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const scroll = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentInset: { top: 0 }, layoutMeasurement: { width: 390, height: 600 }, contentSize: { width: 390, height: 1200 } } });

beforeEach(() => { mockBlurs.length = 0; mockUserId = 1; jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('explicit transaction result and lifecycle', () => {
  it.each([
    { isError: true, fetchStatus: 'idle' },
    { isError: false, fetchStatus: 'paused' },
    [{ status: 'fulfilled', value: { isError: true } }],
    [{ status: 'rejected', reason: new Error('offline') }],
  ])('does not announce success for failed/paused result %j', async value => {
    const { result } = renderHook(() => useExplicitRefresh(() => Promise.resolve(value), '1', 'Profile'));
    await act(async () => result.current.onRefresh());
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toMatch(/try again/);
    expect(Alert.alert).toHaveBeenCalledWith('Could not refresh Profile', expect.any(String));
  });

  it('single-flights work, resets domain scope, and ignores old resolution', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const run = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ scope }) => useExplicitRefresh(run, scope, 'messages'), { initialProps: { scope: '1:peer-a' } });
    await act(async () => { result.current.onRefresh(); result.current.onRefresh(); });
    expect(run).toHaveBeenCalledTimes(1);
    rerender({ scope: '1:peer-b' });
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.onRefresh());
    await act(async () => first.resolve({ isError: true }));
    expect(result.current.refreshing).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => second.resolve({ isError: false }));
    expect(result.current.refreshing).toBe(false);
  });

  it('retires a never-settling UI promise at 30 seconds with actionable failure', async () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useExplicitRefresh(() => new Promise(() => undefined), '1', 'courts'));
    await act(async () => result.current.onRefresh());
    act(() => jest.advanceTimersByTime(REFRESH_BUDGET_MS - 1));
    expect(result.current.refreshing).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toMatch(/too long/);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears background/blur state and ignores rejected completion after leaving', async () => {
    let background!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      background = handler; return { remove: jest.fn() };
    });
    const work = deferred<void>();
    const { result } = renderHook(() => useExplicitRefresh(() => work.promise, '1', 'Profile'));
    await act(async () => result.current.onRefresh());
    act(() => background('background'));
    expect(result.current.refreshing).toBe(false);
    await act(async () => work.reject(new Error('late')));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

it('two screen refreshes join one canonical read; blurring A never aborts B', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const key = ['private', 1, 'shared-refresh-proof'];
  client.setQueryData(key, 'cached');
  const work = deferred<string>();
  const aborted = jest.fn();
  const fetch = jest.fn(({ signal }: { signal: AbortSignal }) => {
    signal.addEventListener('abort', aborted);
    return work.promise;
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const useScreen = (scope: string) => {
    const query = useQuery({ queryKey: key, queryFn: fetch, staleTime: Infinity });
    const refresh = useExplicitRefresh(() => query.refetch({ cancelRefetch: false }), scope, 'Profile');
    return { query, refresh };
  };
  const a = renderHook(() => useScreen('a'), { wrapper });
  const b = renderHook(() => useScreen('b'), { wrapper });
  await act(async () => a.result.current.refresh.onRefresh());
  await act(async () => b.result.current.refresh.onRefresh());
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => mockBlurs[0]?.());
  expect(a.result.current.refresh.refreshing).toBe(false);
  expect(b.result.current.refresh.refreshing).toBe(true);
  a.unmount();
  expect(aborted).not.toHaveBeenCalled();
  await act(async () => work.resolve('fresh'));
  await waitFor(() => expect(b.result.current.query.data).toBe('fresh'));
  expect(b.result.current.refresh.refreshing).toBe(false);
  expect(client.getQueryData(key)).toBe('fresh');
  b.unmount(); client.clear();
});

describe('native host adapters', () => {
  it('stacks the active overlay above list rows without changing list geometry or footer', async () => {
    const work = deferred<void>();
    const footer = <Text>Existing footer</Text>;
    const contentStyle = { paddingBottom: 100 };
    const screen = render(<RefreshFlatList data={[1]} renderItem={() => <Text>Cached row</Text>}
      contentContainerStyle={contentStyle} ListFooterComponent={footer} onRefresh={() => work.promise} />);
    expect(screen.queryByTestId('refresh-indicator')).toBeNull();
    await act(async () => fireEvent.press(screen.getByLabelText('Refresh content')));
    const overlay = screen.getByTestId('refresh-indicator');
    expect(StyleSheet.flatten(overlay.props.style)?.zIndex).toBeGreaterThan(0);
    expect(overlay.props.pointerEvents).toBe('none');
    const list = screen.UNSAFE_getByType(FlatList);
    expect(list.props.contentContainerStyle).toBe(contentStyle);
    expect(list.props.ListFooterComponent).toBe(footer);
    expect(list.props.contentInset).toBeUndefined();
    await act(async () => work.resolve());
    expect(screen.queryByTestId('refresh-indicator')).toBeNull();
  });

  it('keeps the virtualized grid, footer, header, ref and existing gesture handlers', async () => {
    const ref = React.createRef<FlatList<number>>();
    const begin = jest.fn(); const end = jest.fn(); const moved = jest.fn();
    const run = jest.fn().mockResolvedValue({ isError: false });
    const footer = <View testID="original-footer" />;
    const screen = render(<RefreshFlatList ref={ref} testID="grid" data={[1, 2]} numColumns={2}
      ListFooterComponent={footer} ListHeaderComponent={<Text>Header</Text>} renderItem={({ item }) => <Text>{item}</Text>}
      onScrollBeginDrag={begin} onScrollEndDrag={end} onScroll={moved} onRefresh={run} />);
    const list = screen.UNSAFE_getByType(FlatList);
    expect(ref.current).not.toBeNull();
    expect(list.props.numColumns).toBe(2);
    expect(list.props.ListFooterComponent).toBe(footer);
    expect(screen.UNSAFE_queryAllByType(RefreshControl)).toHaveLength(0);
    await act(async () => {
      fireEvent(screen.getByTestId('grid'), 'scrollBeginDrag', scroll(0));
      fireEvent.scroll(screen.getByTestId('grid'), scroll(-90));
      fireEvent(screen.getByTestId('grid'), 'scrollEndDrag', scroll(-90));
    });
    expect(begin).toHaveBeenCalledTimes(1); expect(moved).toHaveBeenCalledTimes(1); expect(end).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('refresh-indicator')).toBeNull();
  });

  it('clears armed gesture and explicit UI on account/filter change', async () => {
    const work = deferred<void>();
    const run = jest.fn(() => work.promise);
    const make = (scope: string) => <RefreshScrollView testID="scroll" onRefresh={run} refreshScope={scope}><Text>Cached</Text></RefreshScrollView>;
    const screen = render(make('filter-a'));
    fireEvent(screen.getByTestId('scroll'), 'scrollBeginDrag', scroll(0));
    fireEvent.scroll(screen.getByTestId('scroll'), scroll(-90));
    expect(screen.getByText('Release to refresh')).toBeTruthy();
    screen.rerender(make('filter-b'));
    expect(screen.queryByTestId('refresh-indicator')).toBeNull();
    await act(async () => fireEvent.press(screen.getByLabelText('Refresh content')));
    mockUserId = 2; screen.rerender(make('filter-b'));
    expect(screen.queryByTestId('refresh-indicator')).toBeNull();
    await act(async () => work.resolve());
  });

  it('keeps Android native busy controlled by explicit work only', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const work = deferred<void>();
    const screen = render(<RefreshFlatList data={[]} renderItem={() => null} refreshing onRefresh={() => work.promise} />);
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
    await act(async () => work.resolve());
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('does not add refresh to League Chat and preserves chronological chat footer/composer', () => {
    const props = { data: [{ id: '1', date: '2026-01-01' }], keyExtractor: (item: { id: string }) => item.id,
      getTimestamp: (item: { date: string }) => item.date, renderBubble: () => <Text>Message</Text>,
      renderComposer: () => <Text>Composer</Text>, bottomInset: 34 };
    const screen = render(<ChatView {...props} />);
    const list = screen.UNSAFE_getByType(FlatList);
    expect(list.props.inverted).toBeUndefined();
    expect(list.props.keyboardDismissMode).toBe('interactive');
    const footerType = list.props.ListFooterComponent.type;
    expect(screen.queryByLabelText('Refresh messages')).toBeNull();
    expect(list.props.refreshControl).toBeUndefined();
    screen.rerender(<ChatView {...props} onRefresh={() => Promise.resolve()} refreshScope="peer-1" />);
    const refreshedList = screen.UNSAFE_getByType(FlatList);
    expect(refreshedList.props.ListFooterComponent.type).toBe(footerType);
    expect(refreshedList.props.onContentSizeChange).toEqual(expect.any(Function));
    expect(screen.getByText('Composer')).toBeTruthy();
    expect(screen.getByLabelText('Refresh messages')).toBeTruthy();
  });
});
