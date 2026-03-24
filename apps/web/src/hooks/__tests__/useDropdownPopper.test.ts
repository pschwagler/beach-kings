import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockUpdate, mockDestroy } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockDestroy: vi.fn(),
}));

vi.mock('@popperjs/core', () => ({
  createPopper: vi.fn(() => ({ update: mockUpdate, destroy: mockDestroy })),
}));

import { createPopper } from '@popperjs/core';
import { useDropdownPopper } from '../useDropdownPopper';

describe('useDropdownPopper', () => {
  let referenceRef;
  let popperRef;

  beforeEach(() => {
    vi.clearAllMocks();

    referenceRef = { current: document.createElement('div') };
    popperRef = { current: document.createElement('div') };

    referenceRef.current.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      left: 0,
      right: 300,
      width: 300,
      height: 100,
    }));
  });

  describe('when isOpen is false', () => {
    it('does not call createPopper', () => {
      renderHook(() => useDropdownPopper(false, referenceRef, popperRef));

      expect(createPopper).not.toHaveBeenCalled();
    });
  });

  describe('when isOpen is true with valid refs', () => {
    it('calls createPopper with correct placement, strategy, and modifiers', () => {
      renderHook(() => useDropdownPopper(true, referenceRef, popperRef));

      expect(createPopper).toHaveBeenCalledTimes(1);

      const [refEl, popEl, options] = createPopper.mock.calls[0];
      expect(refEl).toBe(referenceRef.current);
      expect(popEl).toBe(popperRef.current);
      expect(options.placement).toBe('bottom-start');
      expect(options.strategy).toBe('fixed');

      const modifierNames = options.modifiers.map((m) => m.name);
      expect(modifierNames).toContain('flip');
      expect(modifierNames).toContain('preventOverflow');
      expect(modifierNames).toContain('offset');
      expect(modifierNames).toContain('computeStyles');

      const flip = options.modifiers.find((m) => m.name === 'flip');
      expect(flip.enabled).toBe(false);

      const preventOverflow = options.modifiers.find((m) => m.name === 'preventOverflow');
      expect(preventOverflow.enabled).toBe(false);

      const offset = options.modifiers.find((m) => m.name === 'offset');
      expect(offset.options.offset).toEqual([0, 4]);
    });

    it('sets popperRef.current.style.maxHeight on open', () => {
      // innerHeight default in jsdom is 768; rect.bottom is 200, so spaceBelow = 768 - 200 - 8 = 560 → clamped to 300
      renderHook(() => useDropdownPopper(true, referenceRef, popperRef));

      expect(popperRef.current.style.maxHeight).toBe('300px');
    });
  });

  describe('cleanup when isOpen goes false', () => {
    it('calls destroy when isOpen transitions from true to false', () => {
      const { rerender } = renderHook(
        ({ isOpen }) => useDropdownPopper(isOpen, referenceRef, popperRef),
        { initialProps: { isOpen: true } }
      );

      expect(createPopper).toHaveBeenCalledTimes(1);

      act(() => {
        rerender({ isOpen: false });
      });

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup on unmount', () => {
    it('calls destroy when the hook is unmounted while open', () => {
      const { unmount } = renderHook(() =>
        useDropdownPopper(true, referenceRef, popperRef)
      );

      expect(createPopper).toHaveBeenCalledTimes(1);

      act(() => {
        unmount();
      });

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('null ref guards', () => {
    it('does not call createPopper when referenceRef.current is null and isOpen is true', () => {
      const nullReferenceRef = { current: null };

      renderHook(() => useDropdownPopper(true, nullReferenceRef, popperRef));

      expect(createPopper).not.toHaveBeenCalled();
    });

    it('does not call createPopper when popperRef.current is null and isOpen is true', () => {
      const nullPopperRef = { current: null };

      renderHook(() => useDropdownPopper(true, referenceRef, nullPopperRef));

      expect(createPopper).not.toHaveBeenCalled();
    });
  });
});
