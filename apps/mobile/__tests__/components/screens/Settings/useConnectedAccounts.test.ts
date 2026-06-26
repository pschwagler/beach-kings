/**
 * Tests for the useConnectedAccounts hook.
 *
 * Covers:
 *   - linkGoogle: calls api.linkGoogle then refreshUser on success
 *   - linkGoogle: handles 409 with specific Alert
 *   - linkGoogle: handles other errors with generic Alert
 *   - linkGoogle: silently ignores OAuthCancelledError from promptGoogle
 *   - linkApple: calls api.linkApple then refreshUser on success
 *   - linkApple: handles 409 with specific Alert
 *   - linkApple: silently ignores OAuthCancelledError from signInWithApple
 *   - appleAvailable reflects isAppleSignInAvailable() result
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefreshUser = jest.fn().mockResolvedValue(undefined);

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}));

const mockLinkGoogle = jest.fn();
const mockLinkApple = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    linkGoogle: (...args: unknown[]) => mockLinkGoogle(...args),
    linkApple: (...args: unknown[]) => mockLinkApple(...args),
  },
}));

const mockPromptGoogle = jest.fn();
let mockOnTokenCallback: ((token: string) => Promise<void>) | null = null;

jest.mock('@/lib/oauth', () => {
  const { OAuthCancelledError } = jest.requireActual('@/lib/oauth');
  return {
    useGoogleSignIn: (onToken: (token: string) => Promise<void>) => {
      mockOnTokenCallback = onToken;
      return { promptGoogle: mockPromptGoogle, isConfigured: true };
    },
    signInWithApple: jest.fn(),
    isAppleSignInAvailable: jest.fn().mockResolvedValue(true),
    OAuthCancelledError,
    OAuthNotConfiguredError: class OAuthNotConfiguredError extends Error {},
  };
});

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { useConnectedAccounts } from '@/components/screens/Settings/useConnectedAccounts';
import { OAuthCancelledError } from '@/lib/oauth';
import * as oauthModule from '@/lib/oauth';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPromptGoogle.mockResolvedValue(undefined);
  (oauthModule.signInWithApple as jest.Mock).mockResolvedValue('apple-id-token');
  mockLinkGoogle.mockResolvedValue({ google_connected: true });
  mockLinkApple.mockResolvedValue({ apple_connected: true });
});

// ---------------------------------------------------------------------------
// Tests — Google
// ---------------------------------------------------------------------------

describe('useConnectedAccounts — Google', () => {
  it('calls api.linkGoogle then refreshUser on successful token', async () => {
    const { result } = renderHook(() => useConnectedAccounts());

    // Simulate calling handleConnectGoogle which triggers promptGoogle,
    // which internally calls onToken via the mock
    await act(async () => {
      await result.current.handleConnectGoogle();
      // Simulate the oauth hook firing the onToken callback
      if (mockOnTokenCallback) {
        await mockOnTokenCallback('google-id-token');
      }
    });

    expect(mockLinkGoogle).toHaveBeenCalledWith('google-id-token');
    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled();
    });
  });

  it('shows a specific Alert on 409 error from linkGoogle', async () => {
    mockLinkGoogle.mockRejectedValue(Object.assign(new Error('409 Conflict'), { status: 409 }));
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      if (mockOnTokenCallback) {
        await mockOnTokenCallback('google-id-token');
      }
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Already Linked',
        expect.stringContaining('already linked to another Beach League account'),
      );
    });
  });

  it('shows a generic Alert on non-409 error from linkGoogle', async () => {
    mockLinkGoogle.mockRejectedValue(new Error('server error'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      if (mockOnTokenCallback) {
        await mockOnTokenCallback('google-id-token');
      }
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Link Failed',
        expect.stringContaining('Could not link'),
      );
    });
  });

  it('silently ignores OAuthCancelledError from promptGoogle', async () => {
    mockPromptGoogle.mockRejectedValue(new OAuthCancelledError());
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectGoogle();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockLinkGoogle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — Apple
// ---------------------------------------------------------------------------

describe('useConnectedAccounts — Apple', () => {
  it('calls api.linkApple then refreshUser on success', async () => {
    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    expect(mockLinkApple).toHaveBeenCalledWith('apple-id-token');
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('shows a specific Alert on 409 error from linkApple', async () => {
    mockLinkApple.mockRejectedValue(Object.assign(new Error('409 Conflict'), { status: 409 }));
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Already Linked',
        expect.stringContaining('already linked to another Beach League account'),
      );
    });
  });

  it('silently ignores OAuthCancelledError from signInWithApple', async () => {
    (oauthModule.signInWithApple as jest.Mock).mockRejectedValue(new OAuthCancelledError());
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockLinkApple).not.toHaveBeenCalled();
  });

  it('sets appleAvailable based on isAppleSignInAvailable()', async () => {
    const { result } = renderHook(() => useConnectedAccounts());
    await waitFor(() => {
      expect(result.current.appleAvailable).toBe(true);
    });
  });
});
