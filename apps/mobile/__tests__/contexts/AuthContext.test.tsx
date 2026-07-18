/**
 * Tests for AuthContext provider and useAuth hook.
 * Covers login (email/phone), signup, OAuth, logout, session restore,
 * profileComplete, and route guard logic.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import { renderHook } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();
const mockDismissAll = jest.fn();
let mockCanDismiss = jest.fn(() => true);
const mockSegments: string[] = [];
let mockRootNavigationState = {
  type: 'stack',
  key: 'root',
  index: 0,
  routeNames: ['index', '(auth)', '(tabs)', '(stack)'],
  routes: [{ key: 'tabs-1', name: '(tabs)' }],
  stale: false,
};
const mockCancelQueries = jest.fn(() => Promise.resolve());
const mockClearQueryClient = jest.fn();
const mockQueryClient = {
  cancelQueries: mockCancelQueries,
  clear: mockClearQueryClient,
};
const mockUnsubscribeAuthInvalidated = jest.fn();
let mockAuthInvalidatedListener: (() => void) | null = null;

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    dismissAll: mockDismissAll,
    canDismiss: mockCanDismiss,
  }),
  useRootNavigationState: () => mockRootNavigationState,
  useSegments: () => mockSegments,
}));

jest.mock('@/lib/api', () => ({
  api: {
    getStoredTokens: jest.fn(),
    setAuthTokens: jest.fn(),
    clearAuthTokens: jest.fn(),
    getMe: jest.fn(),
    getCurrentUserPlayer: jest.fn(),
    login: jest.fn(),
    signup: jest.fn(),
    googleAuth: jest.fn(),
    appleAuth: jest.fn(),
    verifyPhone: jest.fn(),
    verifyEmail: jest.fn(),
    logout: jest.fn(),
    onAuthInvalidated: jest.fn((listener: () => void) => {
      mockAuthInvalidatedListener = listener;
      return mockUnsubscribeAuthInvalidated;
    }),
  },
}));

// ---------------------------------------------------------------------------
// Subject under test (imported after mocks)
// ---------------------------------------------------------------------------

import AuthProvider, { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockGetStoredTokens = api.getStoredTokens as jest.MockedFunction<
  typeof api.getStoredTokens
>;
const mockSetAuthTokens = api.setAuthTokens as jest.MockedFunction<
  typeof api.setAuthTokens
>;
const mockClearAuthTokens = api.clearAuthTokens as jest.MockedFunction<
  typeof api.clearAuthTokens
>;
const mockGetMe = api.getMe as jest.MockedFunction<any>;
const mockGetCurrentUserPlayer = api.getCurrentUserPlayer as jest.MockedFunction<any>;
const mockLogin = api.login as jest.MockedFunction<any>;
const mockSignup = api.signup as jest.MockedFunction<any>;
const mockGoogleAuth = api.googleAuth as jest.MockedFunction<any>;
const mockAppleAuth = api.appleAuth as jest.MockedFunction<any>;
const mockVerifyPhone = api.verifyPhone as jest.MockedFunction<any>;
const mockLogout = api.logout as jest.MockedFunction<any>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Matches the UserResponse from api.getMe() */
const mockMeResponse = {
  id: 1,
  phone_number: '+12125551234',
  email: 'test@example.com',
  is_verified: true,
  auth_provider: 'phone',
  created_at: '2025-01-01T00:00:00Z',
};

/** A Player with all fields required by isProfileComplete (gender, level, city, state, location_id). */
const mockPlayerComplete = {
  id: 42,
  gender: 'male',
  level: 'b',
  city: 'San Diego',
  state: 'CA',
  location_id: 'socal_sd',
};

/** A Player missing required profile fields. */
const mockPlayerIncomplete = {
  id: 42,
  gender: null,
  level: null,
  city: null,
  state: null,
  location_id: null,
};

/** Matches the AuthResponse from login/signup/OAuth endpoints */
const mockAuthResponse = {
  access_token: 'acc',
  refresh_token: 'ref',
  token_type: 'bearer',
  user_id: 1,
  phone_number: '+12125551234',
  is_verified: true,
  auth_provider: 'phone',
  profile_complete: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TestConsumer(): React.ReactElement {
  const { user, isLoading, isAuthenticated, profileComplete } = useAuth();
  return (
    <Text testID="output">
      {JSON.stringify({ user, isLoading, isAuthenticated, profileComplete })}
    </Text>
  );
}

function wrapper({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <AuthProvider>{children}</AuthProvider>;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Global defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStoredTokens.mockResolvedValue({
    accessToken: null,
    refreshToken: null,
  });
  mockSetAuthTokens.mockResolvedValue(undefined);
  mockClearAuthTokens.mockResolvedValue(undefined);
  mockCancelQueries.mockResolvedValue(undefined);
  mockAuthInvalidatedListener = null;
  mockSegments.splice(0, mockSegments.length);
  mockCanDismiss = jest.fn(() => true);
  mockRootNavigationState = {
    type: 'stack',
    key: 'root',
    index: 0,
    routeNames: ['index', '(auth)', '(tabs)', '(stack)'],
    routes: [{ key: 'tabs-1', name: '(tabs)' }],
    stale: false,
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
    consoleError.mockRestore();
  });
});

describe('AuthProvider — session restore', () => {
  it('transitions to unauthenticated when no token stored', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    const parsed = JSON.parse(getByTestId('output').props.children);
    expect(parsed.isAuthenticated).toBe(false);
    expect(parsed.user).toBeNull();
    expect(parsed.profileComplete).toBe(false);
  });

  it('restores session with complete profile when valid token exists', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    const parsed = JSON.parse(getByTestId('output').props.children);
    expect(parsed.isAuthenticated).toBe(true);
    expect(parsed.profileComplete).toBe(true);
    expect(parsed.user.id).toBe(1);
    expect(parsed.user.phone_number).toBe('+12125551234');
  });

  it('sets profileComplete false when player is missing required fields', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerIncomplete);

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    const parsed = JSON.parse(getByTestId('output').props.children);
    expect(parsed.isAuthenticated).toBe(true);
    expect(parsed.profileComplete).toBe(false);
  });

  it('sets profileComplete false when player endpoint throws', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockRejectedValue(new Error('404'));

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    const parsed = JSON.parse(getByTestId('output').props.children);
    expect(parsed.isAuthenticated).toBe(true);
    expect(parsed.profileComplete).toBe(false);
  });

  it('clears tokens when api.getMe throws', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'expired',
      refreshToken: null,
    });
    mockGetMe.mockRejectedValue(new Error('401 Unauthorized'));

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    const parsed = JSON.parse(getByTestId('output').props.children);
    expect(parsed.isAuthenticated).toBe(false);
    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider — login', () => {
  it('logs in with email and stores tokens', async () => {
    mockLogin.mockResolvedValue(mockAuthResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.profileComplete).toBe(true);
    expect(result.current.user?.id).toBe(1);
  });

  it('logs in with phone number', async () => {
    mockLogin.mockResolvedValue(mockAuthResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({
        phoneNumber: '2125551234',
        password: 'password123',
      });
    });

    expect(mockLogin).toHaveBeenCalledWith({
      phone_number: '2125551234',
      password: 'password123',
    });
  });

  it('propagates error when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login({
          email: 'test@example.com',
          password: 'wrong',
        });
      }),
    ).rejects.toThrow('Network error');

    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthProvider — signup', () => {
  it('signs up with email and does not authenticate until verification', async () => {
    mockSignup.mockResolvedValue({
      status: 'pending_verification',
      message: 'Check your email for a verification code',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      });
    });

    expect(mockSignup).toHaveBeenCalledWith({
      email: 'new@example.com',
      phone_number: undefined,
      password: 'password123',
      first_name: 'New',
      last_name: 'User',
    });
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('passes optional phoneNumber through to api.signup', async () => {
    mockSignup.mockResolvedValue({
      status: 'pending_verification',
      message: 'Check your email for a verification code',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup({
        email: 'new@example.com',
        phoneNumber: '2125551234',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      });
    });

    expect(mockSignup).toHaveBeenCalledWith({
      email: 'new@example.com',
      phone_number: '2125551234',
      password: 'password123',
      first_name: 'New',
      last_name: 'User',
    });
  });

  it('propagates error when signup fails', async () => {
    mockSignup.mockRejectedValue(new Error('Email taken'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.signup({
          email: 'taken@example.com',
          password: 'pass1234',
          firstName: 'A',
          lastName: 'B',
        });
      }),
    ).rejects.toThrow('Email taken');
  });
});

describe('AuthProvider — OAuth', () => {
  it('logs in with Google and stores tokens', async () => {
    mockGoogleAuth.mockResolvedValue(mockAuthResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle('google-id-token');
    });

    expect(mockGoogleAuth).toHaveBeenCalledWith('google-id-token');
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logs in with Apple and stores tokens', async () => {
    mockAppleAuth.mockResolvedValue(mockAuthResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithApple('apple-id-token');
    });

    expect(mockAppleAuth).toHaveBeenCalledWith('apple-id-token');
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider — verifyPhone', () => {
  it('verifies phone and updates auth state', async () => {
    mockVerifyPhone.mockResolvedValue(mockAuthResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.verifyPhone('+12125551234', '123456');
    });

    expect(mockVerifyPhone).toHaveBeenCalledWith('+12125551234', '123456');
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider — logout', () => {
  it('clears tokens and transitions to unauthenticated', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);
    mockLogout.mockResolvedValue(undefined);
    mockRootNavigationState = {
      type: 'stack',
      key: 'root',
      index: 1,
      routeNames: ['index', '(auth)', '(tabs)', '(stack)'],
      routes: [
        { key: 'tabs-1', name: '(tabs)' },
        { key: 'stack-1', name: '(stack)' },
      ],
      stale: false,
    };

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    const credentialClearOrder = mockClearAuthTokens.mock.invocationCallOrder.at(-1)!;
    const queryClearOrder = mockClearQueryClient.mock.invocationCallOrder.at(-1)!;
    expect(credentialClearOrder).toBeLessThan(queryClearOrder);

    // S1 PII-flash fix: the route guard must dismiss retained (tabs)/(stack)
    // root-stack history before replacing to welcome.
    await waitFor(() => {
      expect(mockDismissAll).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome');
    });
  });

  it('still clears local state when logout API fails', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);
    mockLogout.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('still clears cache and local identity when credential storage removal fails', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);
    mockLogout.mockResolvedValue(undefined);
    mockClearAuthTokens.mockRejectedValue(new Error('secure storage unavailable'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearQueryClient).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('AuthProvider — transition races', () => {
  it('does not let deferred session restoration republish after logout', async () => {
    const storedTokens = deferred<{
      accessToken: string | null;
      refreshToken: string | null;
    }>();
    mockGetStoredTokens.mockReturnValue(storedTokens.promise);
    mockLogout.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(mockGetStoredTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.logout();
      storedTokens.resolve({ accessToken: 'stale', refreshToken: 'stale-ref' });
      await Promise.resolve();
    });

    expect(mockGetMe).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('retires the old session before installing replacement credentials', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);
    mockLogin.mockResolvedValue({ ...mockAuthResponse, user_id: 2 });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe(1));

    await act(async () => {
      await result.current.login({
        email: 'second@example.com',
        password: 'password123',
      });
    });

    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(mockClearAuthTokens.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAuthTokens.mock.invocationCallOrder[0],
    );
    expect(result.current.user?.id).toBe(2);
  });

  it('clears auth and cache when the API client invalidates credentials', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      mockAuthInvalidatedListener?.();
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mockClearQueryClient).toHaveBeenCalled();
  });
});

describe('AuthProvider — refreshUser', () => {
  it('re-fetches /me and updates the user in state', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValueOnce(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    const updated = {
      ...mockMeResponse,
      phone_number: '+19998887777',
      is_verified: true,
    };
    mockGetMe.mockResolvedValueOnce(updated);

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(mockGetMe).toHaveBeenCalledTimes(2);
    expect(result.current.user?.phone_number).toBe('+19998887777');
  });

  it('propagates error when api.getMe throws', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValueOnce(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    mockGetMe.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      act(async () => {
        await result.current.refreshUser();
      }),
    ).rejects.toThrow('Network error');
  });
});

describe('AuthProvider — setProfileComplete', () => {
  it('updates profileComplete flag', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profileComplete).toBe(false);

    act(() => {
      result.current.setProfileComplete(true);
    });

    expect(result.current.profileComplete).toBe(true);
  });
});

describe('AuthProvider — route guard', () => {
  it('redirects to welcome when unauthenticated and not in auth group', async () => {
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome');
    });
  });

  it('dismisses retained (tabs)/(stack) root-stack history before replacing to welcome (S1 PII-flash fix)', async () => {
    // Regression test for: with the root <Stack> in app/_layout.tsx keeping
    // (tabs)/(stack) mounted underneath, a bare `replace` to (auth) leaves the
    // previous user's authenticated screen in root-stack history — Android
    // hardware back from Welcome would then pop back into it. The guard must
    // dismiss that history first.
    mockCanDismiss = jest.fn(() => true);
    mockRootNavigationState = {
      type: 'stack',
      key: 'root',
      index: 1,
      routeNames: ['index', '(auth)', '(tabs)', '(stack)'],
      routes: [
        { key: 'tabs-1', name: '(tabs)' },
        { key: 'stack-1', name: '(stack)' },
      ],
      stale: false,
    };
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome');
    });

    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    // dismissAll must run before the replace, not after, so the root stack
    // has already dropped the (tabs)/(stack) entries when (auth) mounts.
    const dismissOrder = mockDismissAll.mock.invocationCallOrder[0];
    const replaceOrder = mockRouterReplace.mock.invocationCallOrder[0];
    expect(dismissOrder).toBeLessThan(replaceOrder);
  });

  it('does not call dismissAll when there is nothing to dismiss', async () => {
    mockCanDismiss = jest.fn(() => false);
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome');
    });

    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('does not dismiss root history for cold-start tab redirects', async () => {
    // During dev-client/Maestro resets the app can briefly land on (tabs)
    // through app/index before auth restore finishes. That root state does not
    // contain an authenticated detail stack, so a replace is enough; calling
    // dismissAll here dispatches POP_TO_TOP with no stack available to handle it.
    mockCanDismiss = jest.fn(() => true);
    mockRootNavigationState = {
      type: 'stack',
      key: 'root',
      index: 1,
      routeNames: ['index', '(auth)', '(tabs)', '(stack)'],
      routes: [
        { key: 'index-1', name: 'index' },
        { key: 'tabs-1', name: '(tabs)' },
      ],
      stale: false,
    };
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome');
    });

    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('does not redirect returning users with incomplete profiles to onboarding', async () => {
    // Returning users (isNewUser=false from session restore) with incomplete
    // profiles should land on home where ProfileBanner nudges them — not be
    // force-redirected to onboarding. New signups are handled separately by
    // the verifyEmail/verifyPhone/OAuth paths that set is_new_user=true.
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerIncomplete);
    mockGetStoredTokens.mockResolvedValue({ accessToken: null, refreshToken: null });
    mockSegments.push('(tabs)');

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('redirects new signups with incomplete profiles to onboarding', async () => {
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerIncomplete);
    mockGoogleAuth.mockResolvedValue({
      ...mockAuthResponse,
      profile_complete: false,
      is_new_user: true,
    });
    mockSegments.push('(tabs)');

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle('google-token');
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('redirects to home when authenticated with complete profile in auth group', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetMe.mockResolvedValue(mockMeResponse);
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerComplete);
    mockSegments.push('(auth)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  it('does not redirect while still loading', async () => {
    mockGetStoredTokens.mockReturnValue(new Promise<never>(() => {}));
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('stays on onboarding when new user with incomplete profile is already on onboarding', async () => {
    // New user (is_new_user=true) already navigated to onboarding — guard should not redirect
    mockGoogleAuth.mockResolvedValue({
      ...mockAuthResponse,
      is_new_user: true,
    });
    mockGetCurrentUserPlayer.mockResolvedValue(mockPlayerIncomplete);
    mockGetStoredTokens.mockResolvedValue({ accessToken: null, refreshToken: null });
    mockSegments.push('(auth)', 'onboarding');

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle('id-token');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should NOT redirect away from onboarding
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(auth)/welcome');
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(tabs)/home');
  });
});
