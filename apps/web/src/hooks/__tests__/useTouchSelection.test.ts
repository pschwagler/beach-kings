import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTouchSelection } from '../useTouchSelection';

const makeTouchStart = (x, y) => ({
  touches: [{ clientX: x, clientY: y }],
});

const makeTouchEnd = (x, y) => ({
  changedTouches: [{ clientX: x, clientY: y }],
  preventDefault: vi.fn(),
});

describe('useTouchSelection', () => {
  let onSelect;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelect = vi.fn();
  });

  it('calls onSelect and preventDefault for a small movement (5px x, 5px y)', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    const touchEnd = makeTouchEnd(105, 105);
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(touchEnd, 'item-a');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('item-a');
    expect(touchEnd.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not call onSelect when X movement exceeds threshold (15px)', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    const touchEnd = makeTouchEnd(115, 100);
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(touchEnd, 'item-b');

    expect(onSelect).not.toHaveBeenCalled();
    expect(touchEnd.preventDefault).not.toHaveBeenCalled();
  });

  it('does not call onSelect when Y movement exceeds threshold (15px)', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    const touchEnd = makeTouchEnd(100, 115);
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(touchEnd, 'item-c');

    expect(onSelect).not.toHaveBeenCalled();
    expect(touchEnd.preventDefault).not.toHaveBeenCalled();
  });

  it('does not call onSelect when movement is exactly 10px (boundary: condition is < 10)', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    const touchEnd = makeTouchEnd(110, 100);
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(touchEnd, 'item-d');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is a no-op when handleTouchEnd is called without a prior handleTouchStart', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchEnd } = result.current;

    const touchEnd = makeTouchEnd(100, 100);
    handleTouchEnd(touchEnd, 'item-e');

    expect(onSelect).not.toHaveBeenCalled();
    expect(touchEnd.preventDefault).not.toHaveBeenCalled();
  });

  it('passes the correct item argument to onSelect', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    const item = { id: 42, name: 'Player' };
    const touchEnd = makeTouchEnd(101, 101);
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(touchEnd, item);

    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it('resets internal state after a touch sequence so the next sequence starts clean', () => {
    const { result } = renderHook(() => useTouchSelection(onSelect));
    const { handleTouchStart, handleTouchEnd } = result.current;

    // First tap
    handleTouchStart(makeTouchStart(100, 100));
    handleTouchEnd(makeTouchEnd(101, 101), 'first');
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Second tap without re-calling handleTouchStart (touchStartPos was nulled)
    handleTouchEnd(makeTouchEnd(101, 101), 'second');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
