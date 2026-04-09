import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  getLocations: vi.fn(),
  getUserLeagues: vi.fn().mockResolvedValue([]),
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false })),
}));

import { getLocations } from '../../services/api';
import { AppProvider, useApp } from '../AppContext';

const mockLocations = [
  { id: 'socal_sd', name: 'San Diego, CA' },
  { id: 'socal_la', name: 'Los Angeles, CA' },
];

function AppConsumer() {
  const { locations, locationsLoading, locationsError, refreshLocations } = useApp();
  return (
    <div>
      <span data-testid="locations-count">{locations.length}</span>
      <span data-testid="loading">{String(locationsLoading)}</span>
      <span data-testid="error">{locationsError ?? 'null'}</span>
      <button data-testid="refresh-btn" onClick={refreshLocations}>
        Refresh
      </button>
    </div>
  );
}

describe('AppProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('on mount', () => {
    it('calls getLocations on mount', async () => {
      getLocations.mockResolvedValue(mockLocations);

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(getLocations).toHaveBeenCalledTimes(1);
    });

    it('sets locations from the API response on success', async () => {
      getLocations.mockResolvedValue(mockLocations);

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('locations-count').textContent).toBe('2');
      });

      expect(screen.getByTestId('error').textContent).toBe('null');
    });

    it('starts with an empty locations array before the fetch completes', () => {
      // Never resolves so we can inspect the initial render synchronously
      getLocations.mockReturnValue(new Promise(() => {}));

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      expect(screen.getByTestId('locations-count').textContent).toBe('0');
    });
  });

  describe('locationsLoading lifecycle', () => {
    it('is true during the fetch and false after it resolves', async () => {
      let resolve;
      getLocations.mockReturnValue(
        new Promise((res) => {
          resolve = res;
        })
      );

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      // Loading is true immediately after mount triggers the effect
      expect(screen.getByTestId('loading').textContent).toBe('true');

      await act(async () => {
        resolve(mockLocations);
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  describe('error handling', () => {
    it('sets locationsError from err.response.data.detail on API failure', async () => {
      getLocations.mockRejectedValue({
        response: { data: { detail: 'Locations unavailable' } },
      });

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('error').textContent).toBe('Locations unavailable');
      expect(screen.getByTestId('locations-count').textContent).toBe('0');
    });

    it('falls back to a generic message when detail is absent', async () => {
      getLocations.mockRejectedValue(new Error('Network error'));

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('error').textContent).toBe('Failed to load locations');
    });

    it('clears a previous error when a subsequent fetch succeeds', async () => {
      getLocations.mockRejectedValueOnce(new Error('Network error'));
      getLocations.mockResolvedValueOnce(mockLocations);

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Failed to load locations');
      });

      await act(async () => {
        screen.getByTestId('refresh-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('null');
      });

      expect(screen.getByTestId('locations-count').textContent).toBe('2');
    });
  });

  describe('refreshLocations', () => {
    it('re-triggers getLocations when called', async () => {
      getLocations.mockResolvedValue(mockLocations);

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(getLocations).toHaveBeenCalledTimes(1);

      await act(async () => {
        screen.getByTestId('refresh-btn').click();
      });

      await waitFor(() => {
        expect(getLocations).toHaveBeenCalledTimes(2);
      });
    });

    it('updates locations with fresh data from the second fetch', async () => {
      const updatedLocations = [
        ...mockLocations,
        { id: 'norcal_sf', name: 'San Francisco, CA' },
      ];
      getLocations.mockResolvedValueOnce(mockLocations);
      getLocations.mockResolvedValueOnce(updatedLocations);

      render(
        <AppProvider>
          <AppConsumer />
        </AppProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('locations-count').textContent).toBe('2');
      });

      await act(async () => {
        screen.getByTestId('refresh-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('locations-count').textContent).toBe('3');
      });
    });
  });

  describe('useApp outside provider', () => {
    it('throws when used outside an AppProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      function Orphan() {
        useApp();
        return null;
      }

      expect(() => render(<Orphan />)).toThrow('useApp must be used within an AppProvider');

      consoleError.mockRestore();
    });
  });
});
