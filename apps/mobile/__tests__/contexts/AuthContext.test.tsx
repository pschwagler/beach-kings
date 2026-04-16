/**
 * Tests for AuthContext provider and useAuth hook.
 * Covers login, signup, logout, session restore, and route guard logic.
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

// The api module is mocked with inline jest.fn() so the factory has no
// dependency on hoisted variable declarations.
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
// Subject under test (imported after mocks are in place)
// ---------------------------------------------------------------------------

import AuthProvider, { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockGetStoredTokens = api.getStoredTokens as jest.MockedFunction<typeof api.getStoredTokens>;
const mockSetAuthTokens = api.setAuthTokens as jest.MockedFunction<typeof api.setAuthTokens>;
const mockClearAuthTokens = api.clearAuthTokens as jest.MockedFunction<typeof api.clearAuthTokens>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGet = (api.client.axiosInstance.get as jest.MockedFunction<any>);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPost = (api.client.axiosInstance.post as jest.MockedFunction<any>);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: 1,
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  player_id: 42,
};

function TestConsumer(): React.ReactElement {
  const { user, isLoading, isAuthenticated } = useAuth();
  return (
    <Text testID="output">
      {JSON.stringify({ user, isLoading, isAuthenticated })}
    </Text>
  );
}

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AuthProvider>{children}</AuthProvider>;
}

// ---------------------------------------------------------------------------
// Global defaults — reset before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStoredTokens.mockResolvedValue({ accessToken: null, refreshToken: null });
  mockSetAuthTokens.mockResolvedValue(undefined);
  mockClearAuthTokens.mockResolvedValue(undefined);
  // Ensure segments is clean between tests
  mockSegments.splice(0, mockSegments.length);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
    consoleError.mockRestore();
  });
});

describe('AuthProvider — session restore', () => {
  it('starts as loading, then transitions to unauthenticated when no token stored', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: null, refreshToken: null });

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
  });

  it('restores session when a valid access token exists', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: 'valid-token', refreshToken: 'refresh' });
    mockGet.mockResolvedValue({ data: mockUser });

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
    expect(parsed.user).toEqual(mockUser);
    expect(mockGet).toHaveBeenCalledWith('/api/users/me');
  });

  it('clears tokens and goes unauthenticated when /api/users/me throws', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: 'expired', refreshToken: null });
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
  it('sets authenticated state and stores tokens on successful login', async () => {
    mockPost.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', user: mockUser },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isLoading).toBe(false);
  });

  it('propagates error when login API call fails', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('test@example.com', 'wrong');
      }),
    ).rejects.toThrow('Network error');

    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthProvider — signup', () => {
  it('sets authenticated state and stores tokens on successful signup', async () => {
    mockPost.mockResolvedValue({
      data: { access_token: 'acc2', refresh_token: 'ref2', user: mockUser },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup('new@example.com', 'pass', 'New', 'User');
    });

    expect(mockPost).toHaveBeenCalledWith('/api/auth/signup', {
      email: 'new@example.com',
      password: 'pass',
      first_name: 'New',
      last_name: 'User',
    });
    expect(mockSetAuthTokens).toHaveBeenCalledWith('acc2', 'ref2');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });

  it('propagates error when signup API call fails', async () => {
    mockPost.mockRejectedValue(new Error('Email taken'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.signup('dup@example.com', 'pass', 'A', 'B');
      }),
    ).rejects.toThrow('Email taken');
  });
});

describe('AuthProvider — logout', () => {
  it('clears tokens and transitions to unauthenticated on logout', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: 'valid', refreshToken: 'ref' });
    mockGet.mockResolvedValue({ data: mockUser });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('AuthProvider — route guard', () => {
  it('redirects to login when unauthenticated and not in auth group', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: null, refreshToken: null });
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('redirects to home when authenticated and in auth group', async () => {
    mockGetStoredTokens.mockResolvedValue({ accessToken: 'valid', refreshToken: 'ref' });
    mockGet.mockResolvedValue({ data: mockUser });
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
    // Never resolve — keeps isLoading: true indefinitely
    mockGetStoredTokens.mockReturnValue(new Promise<never>(() => {}));
    mockSegments.push('(tabs)');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Flush the microtask queue once
    await act(async () => { await Promise.resolve(); });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
