import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { ActivityIndicator, Alert, AppState, Platform, RefreshControl, Text, type AppStateStatus } from 'react-native';
import HomeRefreshScrollView, { HOME_PULL_THRESHOLD } from '@/components/home/HomeRefreshScrollView';
import { HOME_REFRESH_BUDGET_MS, useHomeRefresh } from '@/components/home/useHomeRefresh';

let mockBlur: (() => void) | undefined;
let mockReduceMotion = false;
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduceMotion }));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void)) => { mockBlur = callback(); },
}));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: 'teal' }),
}));

const never = () => new Promise<void>(() => undefined);
function scrollEvent(y: number, inset = 0) {
  return { nativeEvent: { contentOffset: { x: 0, y }, contentInset: { top: inset } } };
}

describe('Home refresh transaction', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('owns only explicit refresh and bounds UI without cancelling shared observers at the deadline', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const refetch = jest.fn(never);
    const cancel = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useHomeRefresh(refetch, cancel, 1));
    expect(result.current.refreshing).toBe(false);
    await act(async () => { result.current.onRefresh(); result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(HOME_REFRESH_BUDGET_MS); });
    expect(cancel).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toMatch(/too long/);
    expect(alert).toHaveBeenCalledWith('Could not refresh Home', expect.stringMatching(/try again/));
    act(() => jest.advanceTimersByTime(0));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not let a previous completion dismiss a newer transaction', async () => {
    let finishFirst!: () => void;
    const refetch = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; })).mockImplementation(never);
    const { result } = renderHook(() => useHomeRefresh(refetch, jest.fn().mockResolvedValue(undefined), 1));
    await act(async () => result.current.onRefresh());
    await act(async () => jest.advanceTimersByTime(HOME_REFRESH_BUDGET_MS));
    await act(async () => result.current.onRefresh());
    await act(async () => finishFirst());
    expect(result.current.refreshing).toBe(true);
  });

  it.each(['reject', 'throw'])('settles a %s without claiming success', async kind => {
    const refetch = () => { if (kind === 'throw') throw new Error('sync'); return Promise.reject(new Error('offline')); };
    const { result } = renderHook(() => useHomeRefresh(refetch, jest.fn(), 1));
    await act(async () => result.current.onRefresh());
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toMatch(/try again/);
    act(() => jest.advanceTimersByTime(0));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resets on blur, background, identity change and unmount without retained timers', async () => {
    let change!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => {
      change = callback;
      return { remove: jest.fn() };
    });
    const cancel = jest.fn().mockResolvedValue(undefined);
    const { result, rerender, unmount } = renderHook(({ identity }) => useHomeRefresh(never, cancel, identity), { initialProps: { identity: 1 } });
    await act(async () => result.current.onRefresh());
    act(() => mockBlur?.());
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.onRefresh());
    act(() => change('background'));
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.onRefresh());
    rerender({ identity: 2 });
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.onRefresh());
    unmount();
    expect(cancel).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(0));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start deferred work after immediate teardown', async () => {
    const run = jest.fn(never);
    const { result, unmount } = renderHook(() => useHomeRefresh(run, jest.fn().mockResolvedValue(undefined), 1));
    act(() => result.current.onRefresh());
    unmount();
    await act(async () => undefined);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('Home pull surface', () => {
  afterEach(() => { jest.restoreAllMocks(); mockReduceMotion = false; });
  function setup(refreshing = false) {
    const onRefresh = jest.fn();
    const tree = render(<HomeRefreshScrollView testID="scroll" refreshing={refreshing} refreshError={null} onRefresh={onRefresh}><Text>Cached card</Text></HomeRefreshScrollView>);
    return { ...tree, onRefresh, scroll: tree.getByTestId('scroll') };
  }

  it('does not mount a native iOS control, and completely unmounts idle overlay', () => {
    const tree = setup();
    expect(tree.UNSAFE_queryAllByType(RefreshControl)).toHaveLength(0);
    expect(tree.queryByTestId('home-refresh-indicator')).toBeNull();
    expect(tree.scroll.props.contentInset).toBeUndefined();
    expect(tree.scroll.props.contentOffset).toBeUndefined();
    expect(tree.scroll.props.alwaysBounceVertical).toBe(true);
    fireEvent(tree.scroll, 'scrollBeginDrag', scrollEvent(0));
    fireEvent.scroll(tree.scroll, scrollEvent(-HOME_PULL_THRESHOLD));
    expect(tree.getByText('Release to refresh')).toBeTruthy();
    fireEvent(tree.scroll, 'scrollEndDrag', scrollEvent(-HOME_PULL_THRESHOLD));
    expect(tree.onRefresh).toHaveBeenCalledTimes(1);
    expect(tree.queryByTestId('home-refresh-indicator')).toBeNull();
  });

  it.each(['short', 'reverse', 'momentum', 'middle', 'cancel'])('does not refresh on %s gestures', kind => {
    const tree = setup();
    if (kind !== 'momentum') fireEvent(tree.scroll, 'scrollBeginDrag', scrollEvent(kind === 'middle' ? 100 : 0));
    fireEvent.scroll(tree.scroll, scrollEvent(-100));
    if (kind === 'cancel') fireEvent(tree.scroll, 'touchCancel');
    fireEvent(tree.scroll, 'scrollEndDrag', scrollEvent(kind === 'short' || kind === 'reverse' ? -20 : -100));
    expect(tree.onRefresh).not.toHaveBeenCalled();
    expect(tree.queryByTestId('home-refresh-indicator')).toBeNull();
  });

  it('measures pull relative to inset and provides non-gesture accessible refresh', () => {
    const tree = setup();
    fireEvent(tree.scroll, 'scrollBeginDrag', scrollEvent(-30, 30));
    fireEvent(tree.scroll, 'scrollEndDrag', scrollEvent(-110, 30));
    fireEvent.press(tree.getByRole('button', { name: 'Refresh Home' }));
    fireEvent(tree.scroll, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(tree.onRefresh).toHaveBeenCalledTimes(3);
  });

  it('keeps native Android pull but uses the explicit controlled busy state', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const tree = setup(true);
    const control = tree.UNSAFE_getByType(RefreshControl);
    expect(control.props.refreshing).toBe(true);
    expect(tree.queryByTestId('home-refresh-indicator')).toBeNull();
    expect(tree.getByText('Cached card')).toBeTruthy();
  });

  it('clears an armed idle gesture on identity change even without navigation blur', () => {
    const onRefresh = jest.fn();
    const make = (identity: string) => <HomeRefreshScrollView testID="scroll" refreshing={false} refreshError={null} onRefresh={onRefresh} refreshScope={identity}><Text>Cached card</Text></HomeRefreshScrollView>;
    const tree = render(make('account-a'));
    fireEvent(tree.getByTestId('scroll'), 'scrollBeginDrag', scrollEvent(0));
    fireEvent.scroll(tree.getByTestId('scroll'), scrollEvent(-100));
    expect(tree.getByText('Release to refresh')).toBeTruthy();
    tree.rerender(make('account-b'));
    fireEvent(tree.getByTestId('scroll'), 'scrollEndDrag', scrollEvent(-100));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(tree.queryByTestId('home-refresh-indicator')).toBeNull();
  });

  it('uses static labeled busy feedback with reduced motion, and never intercepts content taps', () => {
    mockReduceMotion = true;
    const tree = setup(true);
    expect(tree.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    expect(tree.getByTestId('home-refresh-indicator').props.pointerEvents).toBe('none');
  });
});
