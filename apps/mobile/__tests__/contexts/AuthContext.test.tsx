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
const mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSegments: () => mockSegments,
}));

jest.mock('@/lib/api', () => ({
  api: {
    getStoredTokens: jest.fn(),
    setAuthTokens: jest.fn(),
    clearAuthTokens: jest.fn(),
    client: {
      axiosInstance: {
        get: jest.fn(),
        post: jest.fn(),
      },
    },
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGet = api.client.axiosInstance.get as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPost = api.client.axiosInstance.post as jest.MockedFunction<any>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Matches the UserResponse from /api/auth/me */
const mockMeResponse = {
  id: 1,
  phone_number: '+12125551234',
  email: 'test@example.com',
  is_verified: true,
  auth_provider: 'phone',
  created_at: '2025-01-01T00:00:00Z',
};

/** Matches a Player with complete profile (gender + level set) */
const mockPlayerComplete = {
  id: 42,
  gender: 'male',
  level: 'intermediate',
  city: 'San Diego',
};

/** Matches a Player with incomplete profile */
const mockPlayerIncomplete = {
  id: 42,
  gender: null,
  level: null,
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

/** Set up mockGet to respond differently per URL path. */
function mockGetResponses(responses: Record<string, unknown>) {
  mockGet.mockImplementation((url: string) => {
    for (const [path, data] of Object.entries(responses)) {
      if (url.includes(path)) {
        return Promise.resolve({ data });
      }
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
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
  mockSegments.splice(0, mockSegments.length);
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
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerComplete,
    });

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

  it('sets profileComplete false when player has no gender/level', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerIncomplete,
    });

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
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me'))
        return Promise.resolve({ data: mockMeResponse });
      return Promise.reject(new Error('404'));
    });

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

  it('clears tokens when /api/auth/me throws', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'expired',
      refreshToken: null,
    });
    mockGet.mockRejectedValue(new Error('401 Unauthorized'));

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
    mockPost.mockResolvedValue({ data: mockAuthResponse });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.profileComplete).toBe(true);
    expect(result.current.user?.id).toBe(1);
  });

  it('logs in with phone number', async () => {
    mockPost.mockResolvedValue({ data: mockAuthResponse });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({
        phoneNumber: '2125551234',
        password: 'password123',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
      phone_number: '2125551234',
      password: 'password123',
    });
  });

  it('propagates error when login fails', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

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
  it('signs up with phone_number and stores tokens', async () => {
    mockPost.mockResolvedValue({
      data: { ...mockAuthResponse, profile_complete: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup({
        phoneNumber: '2125551234',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/signup', {
      phone_number: '2125551234',
      password: 'password123',
      first_name: 'New',
      last_name: 'User',
      email: undefined,
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.profileComplete).toBe(false);
  });

  it('includes optional email in signup', async () => {
    mockPost.mockResolvedValue({
      data: { ...mockAuthResponse, profile_complete: false },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup({
        phoneNumber: '2125551234',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        email: 'new@example.com',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/signup', {
      phone_number: '2125551234',
      password: 'password123',
      first_name: 'New',
      last_name: 'User',
      email: 'new@example.com',
    });
  });

  it('propagates error when signup fails', async () => {
    mockPost.mockRejectedValue(new Error('Phone taken'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.signup({
          phoneNumber: '2125551234',
          password: 'pass1234',
          firstName: 'A',
          lastName: 'B',
        });
      }),
    ).rejects.toThrow('Phone taken');
  });
});

describe('AuthProvider — OAuth', () => {
  it('logs in with Google and stores tokens', async () => {
    mockPost.mockResolvedValue({ data: mockAuthResponse });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle('google-id-token');
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/google', {
      id_token: 'google-id-token',
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logs in with Apple and stores tokens', async () => {
    mockPost.mockResolvedValue({ data: mockAuthResponse });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithApple('apple-id-token');
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/apple', {
      id_token: 'apple-id-token',
    });
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider — verifyPhone', () => {
  it('verifies phone and updates auth state', async () => {
    mockPost.mockResolvedValue({ data: mockAuthResponse });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.verifyPhone('+12125551234', '123456');
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/verify-phone', {
      phone_number: '+12125551234',
      code: '123456',
    });
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider — logout', () => {
  it('clears tokens and transitions to unauthenticated', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerComplete,
    });
    mockPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/logout');
    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('still clears local state when logout API fails', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerComplete,
    });
    // First call to post (logout) rejects, any other resolves
    mockPost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
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

  it('redirects to onboarding when authenticated but profile incomplete', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerIncomplete,
    });
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('redirects to home when authenticated with complete profile in auth group', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerComplete,
    });
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

  it('stays on onboarding when authenticated with incomplete profile', async () => {
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'ref',
    });
    mockGetResponses({
      '/api/auth/me': mockMeResponse,
      '/api/users/me/player': mockPlayerIncomplete,
    });
    mockSegments.push('(auth)', 'onboarding');

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      const parsed = JSON.parse(getByTestId('output').props.children);
      expect(parsed.isLoading).toBe(false);
    });

    // Should NOT redirect away from onboarding
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(auth)/welcome');
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(tabs)/home');
  });
});
