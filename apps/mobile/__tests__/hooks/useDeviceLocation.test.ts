/**
 * Tests for useDeviceLocation — the centralized expo-location wrapper.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

import * as ExpoLocation from 'expo-location';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';

const mockPermission = ExpoLocation.requestForegroundPermissionsAsync as jest.Mock;
const mockPosition = ExpoLocation.getCurrentPositionAsync as jest.Mock;

beforeEach(() => {
  mockPermission.mockReset();
  mockPosition.mockReset();
});

describe('useDeviceLocation', () => {
  it('resolves coordinates when permission is granted', async () => {
    mockPermission.mockResolvedValue({ status: 'granted' });
    mockPosition.mockResolvedValue({
      coords: { latitude: 32.78, longitude: -117.23 },
    });

    const { result } = renderHook(() => useDeviceLocation());

    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(result.current.coords).toEqual({ latitude: 32.78, longitude: -117.23 });
  });

  it('reports denied (null coords) when permission is refused', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useDeviceLocation());

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.coords).toBeNull();
    expect(mockPosition).not.toHaveBeenCalled();
  });

  it('treats a thrown error as denied', async () => {
    mockPermission.mockRejectedValue(new Error('services off'));

    const { result } = renderHook(() => useDeviceLocation());

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.coords).toBeNull();
  });

  it('does not request permission when disabled', () => {
    const { result } = renderHook(() => useDeviceLocation({ enabled: false }));

    expect(mockPermission).not.toHaveBeenCalled();
    expect(result.current.status).toBe('pending');
  });
});
