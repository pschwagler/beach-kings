import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedViewMode } from '../usePersistedViewMode';

describe('usePersistedViewMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('returns the defaultMode when localStorage is empty', () => {
      const { result } = renderHook(() => usePersistedViewMode('test-key'));
      expect(result.current[0]).toBe('cards');
    });

    it('returns a stored valid value from localStorage', () => {
      localStorage.setItem('test-key', 'clipboard');
      const { result } = renderHook(() => usePersistedViewMode('test-key'));
      expect(result.current[0]).toBe('clipboard');
    });

    it('returns the defaultMode when localStorage has an invalid value', () => {
      localStorage.setItem('test-key', 'grid');
      const { result } = renderHook(() => usePersistedViewMode('test-key'));
      expect(result.current[0]).toBe('cards');
    });

    it('uses a custom defaultMode when provided', () => {
      const { result } = renderHook(() =>
        usePersistedViewMode('test-key', 'clipboard')
      );
      expect(result.current[0]).toBe('clipboard');
    });

    it('prefers a stored valid value over a custom defaultMode', () => {
      localStorage.setItem('test-key', 'cards');
      const { result } = renderHook(() =>
        usePersistedViewMode('test-key', 'clipboard')
      );
      expect(result.current[0]).toBe('cards');
    });
  });

  describe('setViewMode', () => {
    it('updates state to a valid mode and writes to localStorage', () => {
      const { result } = renderHook(() => usePersistedViewMode('test-key'));

      act(() => {
        result.current[1]('clipboard');
      });

      expect(result.current[0]).toBe('clipboard');
      expect(localStorage.getItem('test-key')).toBe('clipboard');
    });

    it('does not update state or localStorage for an invalid mode', () => {
      const { result } = renderHook(() => usePersistedViewMode('test-key'));

      act(() => {
        result.current[1]('invalid');
      });

      expect(result.current[0]).toBe('cards');
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('can set mode back to cards after clipboard', () => {
      const { result } = renderHook(() =>
        usePersistedViewMode('test-key', 'clipboard')
      );

      act(() => {
        result.current[1]('cards');
      });

      expect(result.current[0]).toBe('cards');
      expect(localStorage.getItem('test-key')).toBe('cards');
    });

    it('does not write to localStorage when given an empty string', () => {
      const { result } = renderHook(() => usePersistedViewMode('test-key'));

      act(() => {
        result.current[1]('');
      });

      expect(result.current[0]).toBe('cards');
      expect(localStorage.getItem('test-key')).toBeNull();
    });
  });
});
