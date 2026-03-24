import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { debounce, useDebounce } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after the wait period', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced();
    vi.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the wait period', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced();
    vi.advanceTimersByTime(299);

    expect(callback).not.toHaveBeenCalled();
  });

  it('resets timer on rapid calls so only the last call fires', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('passes the correct arguments to the callback', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced('hello', 42, { key: 'value' });
    vi.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledWith('hello', 42, { key: 'value' });
  });

  it('multiple independent debounced functions do not interfere with each other', () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();
    const debouncedA = debounce(callbackA, 300);
    const debouncedB = debounce(callbackB, 500);

    debouncedA('a');
    debouncedB('b');

    vi.advanceTimersByTime(300);
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackA).toHaveBeenCalledWith('a');
    expect(callbackB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(callbackB).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledWith('b');
  });
});

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stable function reference across renders', () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(() => useDebounce(callback, 300));

    const firstRef = result.current;
    rerender();
    const secondRef = result.current;

    expect(firstRef).toBe(secondRef);
  });

  it('debounces the callback by the specified delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('test');
  });

  it('uses the latest callback ref when the callback is updated between renders', () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const { result, rerender } = renderHook(
      ({ cb }) => useDebounce(cb, 300),
      { initialProps: { cb: firstCallback } }
    );

    act(() => {
      result.current('value');
    });

    rerender({ cb: secondCallback });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledWith('value');
  });

  it('does not fire the callback after the hook unmounts', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('test');
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
