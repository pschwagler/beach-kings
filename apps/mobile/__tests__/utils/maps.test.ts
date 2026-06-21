/**
 * Unit tests for the maps deep-link utility.
 *
 * Covers:
 *   - URL building for Apple Maps (iOS)
 *   - URL building for Google Maps (Android)
 *   - Platform.select routing
 *   - openDirections calls Linking.openURL with the correct URL
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before module imports
// ---------------------------------------------------------------------------

const mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => {
  const mockSelect = jest.fn((map: Record<string, string>) => map.ios ?? map.default);
  return {
    Linking: {
      openURL: (...args: unknown[]) => mockOpenURL(...args),
    },
    Platform: {
      select: mockSelect,
      OS: 'ios',
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import { Linking, Platform } from 'react-native';
import {
  buildAppleMapsUrl,
  buildGoogleMapsUrl,
  buildMapsUrl,
  openDirections,
} from '../../src/utils/maps';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TARGET = {
  latitude: 33.8847,
  longitude: -118.4109,
  name: 'Manhattan Beach Courts',
};

// Convenience accessor for the mock function
const mockPlatformSelect = Platform.select as jest.Mock;

// ---------------------------------------------------------------------------
// buildAppleMapsUrl
// ---------------------------------------------------------------------------

describe('buildAppleMapsUrl', () => {
  it('includes latitude and longitude as ll param', () => {
    const url = buildAppleMapsUrl(TARGET);
    expect(url).toContain('ll=33.8847,-118.4109');
  });

  it('includes encoded name as q param', () => {
    const url = buildAppleMapsUrl(TARGET);
    expect(url).toContain('q=Manhattan%20Beach%20Courts');
  });

  it('uses the apple maps base URL', () => {
    const url = buildAppleMapsUrl(TARGET);
    expect(url).toMatch(/^http:\/\/maps\.apple\.com\//);
  });

  it('handles names with special characters', () => {
    const special = { ...TARGET, name: 'QBK & Friends (Indoor)' };
    const url = buildAppleMapsUrl(special);
    expect(url).toContain('q=QBK%20%26%20Friends%20(Indoor)');
  });
});

// ---------------------------------------------------------------------------
// buildGoogleMapsUrl
// ---------------------------------------------------------------------------

describe('buildGoogleMapsUrl', () => {
  it('includes encoded name as q param', () => {
    const url = buildGoogleMapsUrl(TARGET);
    expect(url).toContain('q=Manhattan%20Beach%20Courts');
  });

  it('includes center param with lat/lon', () => {
    const url = buildGoogleMapsUrl(TARGET);
    expect(url).toContain('center=33.8847,-118.4109');
  });

  it('uses the google maps base URL', () => {
    const url = buildGoogleMapsUrl(TARGET);
    expect(url).toMatch(/^https:\/\/maps\.google\.com\//);
  });
});

// ---------------------------------------------------------------------------
// buildMapsUrl — platform routing
// ---------------------------------------------------------------------------

describe('buildMapsUrl', () => {
  beforeEach(() => {
    mockPlatformSelect.mockReset();
  });

  it('delegates to Platform.select with ios/android/default keys', () => {
    const appleUrl = buildAppleMapsUrl(TARGET);
    mockPlatformSelect.mockReturnValue(appleUrl);
    buildMapsUrl(TARGET);
    expect(mockPlatformSelect).toHaveBeenCalledWith({
      ios: expect.stringContaining('maps.apple.com'),
      android: expect.stringContaining('maps.google.com'),
      default: expect.stringContaining('maps.apple.com'),
    });
  });

  it('returns apple maps URL when Platform.select returns it', () => {
    const appleUrl = buildAppleMapsUrl(TARGET);
    mockPlatformSelect.mockReturnValue(appleUrl);
    expect(buildMapsUrl(TARGET)).toBe(appleUrl);
  });

  it('returns google maps URL when Platform.select returns it', () => {
    const googleUrl = buildGoogleMapsUrl(TARGET);
    mockPlatformSelect.mockReturnValue(googleUrl);
    expect(buildMapsUrl(TARGET)).toBe(googleUrl);
  });
});

// ---------------------------------------------------------------------------
// openDirections
// ---------------------------------------------------------------------------

describe('openDirections', () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    mockOpenURL.mockResolvedValue(undefined);
    mockPlatformSelect.mockReset();
    // Default: return the iOS (apple maps) path
    mockPlatformSelect.mockImplementation(
      (map: Record<string, string>) => map.ios ?? map.default,
    );
  });

  it('calls Linking.openURL with a maps URL', async () => {
    await openDirections(TARGET);
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const [url] = mockOpenURL.mock.calls[0] as [string];
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('passes an apple maps URL on iOS', async () => {
    mockPlatformSelect.mockImplementation(
      (map: Record<string, string>) => map.ios ?? map.default,
    );
    await openDirections(TARGET);
    const [url] = mockOpenURL.mock.calls[0] as [string];
    expect(url).toContain('maps.apple.com');
  });

  it('passes a google maps URL when Platform.select returns the android path', async () => {
    mockPlatformSelect.mockImplementation(
      (map: Record<string, string>) => map.android ?? map.default,
    );
    await openDirections(TARGET);
    const [url] = mockOpenURL.mock.calls[0] as [string];
    expect(url).toContain('maps.google.com');
  });

  it('propagates errors from Linking.openURL', async () => {
    mockOpenURL.mockRejectedValue(new Error('Cannot open URL'));
    await expect(openDirections(TARGET)).rejects.toThrow('Cannot open URL');
  });

  it('encodes the court name in the maps URL', async () => {
    await openDirections(TARGET);
    const [url] = mockOpenURL.mock.calls[0] as [string];
    expect(url).toContain('Manhattan%20Beach%20Courts');
  });

  it('includes lat/lon in the maps URL', async () => {
    await openDirections(TARGET);
    const [url] = mockOpenURL.mock.calls[0] as [string];
    expect(url).toContain('33.8847');
    expect(url).toContain('-118.4109');
  });
});

