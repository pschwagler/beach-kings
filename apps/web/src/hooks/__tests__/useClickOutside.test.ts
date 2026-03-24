import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { useClickOutside } from '../useClickOutside';

describe('useClickOutside', () => {
  let ref;
  let onClose;

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
    ref = { current: document.createElement('div') };
    document.body.appendChild(ref.current);
  });

  afterEach(() => {
    if (ref.current && document.body.contains(ref.current)) {
      document.body.removeChild(ref.current);
    }
  });

  it('calls onClose when clicking outside the ref while active', () => {
    renderHook(() => useClickOutside(ref, true, onClose));

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the ref while active', () => {
    renderHook(() => useClickOutside(ref, true, onClose));

    act(() => {
      ref.current.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when inactive and clicking outside', () => {
    renderHook(() => useClickOutside(ref, false, onClose));

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not crash or call onClose when ref.current is null', () => {
    const nullRef = { current: null };

    renderHook(() => useClickOutside(nullRef, true, onClose));

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the event listener on cleanup (inactive after unmount)', () => {
    const { unmount } = renderHook(() => useClickOutside(ref, true, onClose));

    unmount();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-registers listener when isActive transitions from false to true', () => {
    let isActive = false;
    const { rerender } = renderHook(() => useClickOutside(ref, isActive, onClose));

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    isActive = true;
    rerender();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
