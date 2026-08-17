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
import { OAuthCancelledError, OAuthNotConfiguredError } from '@/lib/oauth';
import * as oauthModule from '@/lib/oauth';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPromptGoogle.mockResolvedValue(undefined);
  (oauthModule.signInWithApple as jest.Mock).mockResolvedValue({
    idToken: 'apple-id-token',
    authorizationCode: 'apple-authorization-code',
  });
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

  it('does not report link failure when only the post-link refresh fails', async () => {
    mockRefreshUser.mockRejectedValueOnce(new Error('offline'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderHook(() => useConnectedAccounts());

    await act(async () => {
      if (mockOnTokenCallback) await mockOnTokenCallback('google-id-token');
    });

    expect(mockLinkGoogle).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Account Linked',
      expect.stringContaining('was linked'),
    );
    expect(alertSpy).not.toHaveBeenCalledWith('Link Failed', expect.any(String));
  });

  it('shows a specific Alert on 409 error from linkGoogle', async () => {
    mockLinkGoogle.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { code: 'PROVIDER_LINK_CONFLICT' } },
      },
    });
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

  it('distinguishes a different Google identity already connected here', async () => {
    mockLinkGoogle.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { code: 'PROVIDER_ALREADY_CONNECTED' } },
      },
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderHook(() => useConnectedAccounts());

    await act(async () => {
      if (mockOnTokenCallback) await mockOnTokenCallback('google-id-token');
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Already Connected',
      expect.stringContaining('different Google account'),
    );
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

  it.each(['PROVIDER_LINK_CONFIG', 'PROVIDER_LINK_AUDIENCE'])(
    'shows actionable configuration copy for %s',
    async (code) => {
      mockLinkGoogle.mockRejectedValue({
        response: { status: 503, data: { detail: { code } } },
      });
      const alertSpy = jest.spyOn(Alert, 'alert');
      renderHook(() => useConnectedAccounts());

      await act(async () => {
        if (mockOnTokenCallback) await mockOnTokenCallback('google-id-token');
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Account Linking Unavailable',
        expect.stringContaining(code),
      );
    },
  );

  it('shows a stable invalid-token diagnostic', async () => {
    mockLinkGoogle.mockRejectedValue({
      response: {
        status: 401,
        data: { detail: { code: 'PROVIDER_LINK_TOKEN_INVALID' } },
      },
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderHook(() => useConnectedAccounts());

    await act(async () => {
      if (mockOnTokenCallback) await mockOnTokenCallback('google-id-token');
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Authorization Expired',
      expect.stringContaining('PROVIDER_LINK_TOKEN_INVALID'),
    );
  });

  it('identifies app-build configuration failure before Google linking starts', async () => {
    mockPromptGoogle.mockRejectedValue(new OAuthNotConfiguredError('google'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectGoogle();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Account Linking Unavailable',
      expect.stringContaining('PROVIDER_LINK_CONFIG'),
    );
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

    expect(mockLinkApple).toHaveBeenCalledWith({
      idToken: 'apple-id-token',
      authorizationCode: 'apple-authorization-code',
    });
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('reports committed Apple success accurately when only refreshUser fails', async () => {
    mockRefreshUser.mockRejectedValueOnce(new Error('offline'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    expect(mockLinkApple).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Account Linked',
      expect.stringContaining('was linked'),
    );
    expect(alertSpy).not.toHaveBeenCalledWith('Link Failed', expect.any(String));
  });

  it('shows a specific Alert on 409 error from linkApple', async () => {
    mockLinkApple.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { code: 'PROVIDER_LINK_CONFLICT' } },
      },
    });
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

  it('distinguishes a different Apple identity already connected here', async () => {
    mockLinkApple.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { code: 'PROVIDER_ALREADY_CONNECTED' } },
      },
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Already Connected',
      expect.stringContaining('different Apple account'),
    );
  });

  it('explains that Apple code-exchange failure did not partially link', async () => {
    mockLinkApple.mockRejectedValue({
      response: {
        status: 503,
        data: { detail: { code: 'APPLE_LINK_CODE_EXCHANGE' } },
      },
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { result } = renderHook(() => useConnectedAccounts());

    await act(async () => {
      await result.current.handleConnectApple();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Apple Link Not Completed',
      expect.stringContaining('not partially linked'),
    );
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
