import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserPosition } from '../useUserPosition';

describe('useUserPosition', () => {
  let mockGetCurrentPosition;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: mockGetCurrentPosition },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('geolocation success', () => {
    it('sets position and source to geolocation on success when no profileCoords', async () => {
      const { result } = renderHook(() => useUserPosition(null));

      expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);

      const successCb = mockGetCurrentPosition.mock.calls[0][0];
      act(() => {
        successCb({ coords: { latitude: 33.0, longitude: -117.0 } });
      });

      expect(result.current.position).toEqual({ latitude: 33.0, longitude: -117.0 });
      expect(result.current.source).toBe('geolocation');
    });

    it('overrides profileCoords with geolocation on success', () => {
      const profileCoords = { latitude: 34.0, longitude: -118.0 };
      const { result } = renderHook(() => useUserPosition(profileCoords));

      expect(result.current.source).toBe('profile');

      const successCb = mockGetCurrentPosition.mock.calls[0][0];
      act(() => {
        successCb({ coords: { latitude: 33.0, longitude: -117.0 } });
      });

      expect(result.current.position).toEqual({ latitude: 33.0, longitude: -117.0 });
      expect(result.current.source).toBe('geolocation');
    });
  });

  describe('geolocation denied', () => {
    it('leaves position null and source null when geo is denied and no profileCoords', () => {
      const { result } = renderHook(() => useUserPosition(null));

      const errorCb = mockGetCurrentPosition.mock.calls[0][1];
      act(() => {
        errorCb(new Error('denied'));
      });

      expect(result.current.position).toBeNull();
      expect(result.current.source).toBeNull();
    });
  });

  describe('profileCoords provided', () => {
    it('initializes from profileCoords when no geo has run', () => {
      // Stub navigator without geolocation to prevent geo attempt
      vi.stubGlobal('navigator', {});

      const profileCoords = { latitude: 34.0, longitude: -118.0 };
      const { result } = renderHook(() => useUserPosition(profileCoords));

      expect(result.current.position).toEqual(profileCoords);
      expect(result.current.source).toBe('profile');
      expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    });
  });

  describe('skipGeolocation option', () => {
    it('never calls geolocation when skipGeolocation is true', () => {
      const { result } = renderHook(() =>
        useUserPosition(null, { skipGeolocation: true })
      );

      expect(mockGetCurrentPosition).not.toHaveBeenCalled();
      expect(result.current.position).toBeNull();
      expect(result.current.source).toBeNull();
    });

    it('returns profileCoords without calling geo when skipGeolocation is true', () => {
      const profileCoords = { latitude: 34.0, longitude: -118.0 };
      const { result } = renderHook(() =>
        useUserPosition(profileCoords, { skipGeolocation: true })
      );

      expect(mockGetCurrentPosition).not.toHaveBeenCalled();
      expect(result.current.position).toEqual(profileCoords);
      expect(result.current.source).toBe('profile');
    });
  });

  describe('profileCoords arriving after initial render', () => {
    it('updates position and source when profileCoords arrives on rerender and geo has not succeeded', () => {
      vi.stubGlobal('navigator', {}); // no geolocation

      const { result, rerender } = renderHook(
        ({ coords }) => useUserPosition(coords),
        { initialProps: { coords: null } }
      );

      expect(result.current.position).toBeNull();
      expect(result.current.source).toBeNull();

      const profileCoords = { latitude: 32.7, longitude: -117.1 };
      act(() => {
        rerender({ coords: profileCoords });
      });

      expect(result.current.position).toEqual(profileCoords);
      expect(result.current.source).toBe('profile');
    });

    it('does not override geolocation source when profileCoords rerenders', () => {
      const { result, rerender } = renderHook(
        ({ coords }) => useUserPosition(coords),
        { initialProps: { coords: null } }
      );

      // Simulate geo success first
      const successCb = mockGetCurrentPosition.mock.calls[0][0];
      act(() => {
        successCb({ coords: { latitude: 33.0, longitude: -117.0 } });
      });

      expect(result.current.source).toBe('geolocation');

      // Rerender with profileCoords — geo should still win
      act(() => {
        rerender({ coords: { latitude: 34.0, longitude: -118.0 } });
      });

      expect(result.current.source).toBe('geolocation');
      expect(result.current.position).toEqual({ latitude: 33.0, longitude: -117.0 });
    });
  });

  describe('geolocation attempt is made only once', () => {
    it('calls getCurrentPosition exactly once across multiple rerenders', () => {
      const { rerender } = renderHook(() => useUserPosition(null));

      rerender();
      rerender();

      expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });
});
