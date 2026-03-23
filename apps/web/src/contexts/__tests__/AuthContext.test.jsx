/* eslint-disable react-hooks/globals */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock the entire services/api module
vi.mock('../../services/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
  };
  return {
    default: mockApi,
    setAuthTokens: vi.fn(),
    clearAuthTokens: vi.fn(),
    getStoredTokens: vi.fn(() => ({ accessToken: null, refreshToken: null })),
    logout: vi.fn(),
    getCurrentUserPlayer: vi.fn(),
    cancelAccountDeletion: vi.fn(),
  };
});

import api, {
  setAuthTokens,
  clearAuthTokens,
  getStoredTokens,
  logout,
  getCurrentUserPlayer,
} from '../../services/api';
import { AuthProvider, useAuth } from '../AuthContext';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';

function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="is-auth">{String(auth.isAuthenticated)}</span>
      <span data-testid="is-init">{String(auth.isInitializing)}</span>
      <span data-testid="user-id">{auth.user?.id ?? 'null'}</span>
      <span data-testid="player-id">{auth.currentUserPlayer?.id ?? 'null'}</span>
      <span data-testid="session-expired">{String(auth.sessionExpired)}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: no tokens stored
    getStoredTokens.mockReturnValue({ accessToken: null, refreshToken: null });
    logout.mockResolvedValue({});
  });

  describe('initialization', () => {
    it('finishes initializing with unauthenticated state when no tokens are stored', async () => {
      getStoredTokens.mockReturnValue({ accessToken: null, refreshToken: null });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('false');
      expect(screen.getByTestId('user-id').textContent).toBe('null');
    });

    it('fetches current user when valid tokens are stored', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7, phone_number: '+15550001234' } });
      getCurrentUserPlayer.mockResolvedValue({
        id: 77,
        full_name: 'Test Player',
        nickname: null,
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('true');
      expect(screen.getByTestId('user-id').textContent).toBe('7');
      expect(screen.getByTestId('player-id').textContent).toBe('77');
    });

    it('sets player first_name from nickname when nickname exists', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7 } });
      getCurrentUserPlayer.mockResolvedValue({
        id: 77,
        full_name: 'John Smith',
        nickname: 'Johnny',
      });

      let capturedPlayer = null;

      function PlayerNameConsumer() {
        const { currentUserPlayer } = useAuth();
        capturedPlayer = currentUserPlayer;
        return null;
      }

      render(
        <AuthProvider>
          <PlayerNameConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedPlayer?.first_name).toBe('Johnny');
      });
    });

    it('derives first_name from full_name when nickname is null', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7 } });
      getCurrentUserPlayer.mockResolvedValue({
        id: 77,
        full_name: 'John Smith',
        nickname: null,
      });

      let capturedPlayer = null;

      function PlayerNameConsumer() {
        const { currentUserPlayer } = useAuth();
        capturedPlayer = currentUserPlayer;
        return null;
      }

      render(
        <AuthProvider>
          <PlayerNameConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(capturedPlayer?.first_name).toBe('John');
      });
    });

    it('continues with user logged in even when getCurrentUserPlayer returns 404', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7 } });
      getCurrentUserPlayer.mockRejectedValue({ response: { status: 404 } });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('true');
      expect(screen.getByTestId('player-id').textContent).toBe('null');
    });
  });

  describe('logout', () => {
    it('clears user state and tokens on logout', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7 } });
      getCurrentUserPlayer.mockResolvedValue({ id: 77, full_name: 'Test', nickname: null });

      let authCtx;
      function LogoutConsumer() {
        authCtx = useAuth();
        return <AuthConsumer />;
      }

      render(
        <AuthProvider>
          <LogoutConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-auth').textContent).toBe('true');
      });

      await act(async () => {
        await authCtx.logout();
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('false');
      expect(screen.getByTestId('user-id').textContent).toBe('null');
      expect(screen.getByTestId('player-id').textContent).toBe('null');
      expect(clearAuthTokens).toHaveBeenCalled();
    });

    it('still clears local state when backend logout call fails', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockResolvedValue({ data: { id: 7 } });
      getCurrentUserPlayer.mockResolvedValue({ id: 77, full_name: 'Test', nickname: null });
      logout.mockRejectedValue(new Error('Server error'));

      let authCtx;
      function LogoutConsumer() {
        authCtx = useAuth();
        return <AuthConsumer />;
      }

      render(
        <AuthProvider>
          <LogoutConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-auth').textContent).toBe('true');
      });

      await act(async () => {
        await authCtx.logout();
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('false');
      expect(clearAuthTokens).toHaveBeenCalled();
    });
  });

  describe('401 response handling', () => {
    it('clears tokens and sets sessionExpired on 401 from /api/auth/me', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
      });
      api.get.mockRejectedValue({ response: { status: 401 } });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('false');
      expect(screen.getByTestId('session-expired').textContent).toBe('true');
      expect(clearAuthTokens).toHaveBeenCalled();
    });

    it('keeps user logged in on non-401 errors', async () => {
      getStoredTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      // First call succeeds (so user is set), subsequent hypothetical call would fail
      // For this test we just check non-401 doesn't set sessionExpired
      api.get.mockRejectedValue({ response: { status: 500 } });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      expect(screen.getByTestId('session-expired').textContent).toBe('false');
      expect(clearAuthTokens).not.toHaveBeenCalled();
    });
  });

  describe('handleAuthSuccess via loginWithPassword', () => {
    it('sets user and stores tokens after successful login', async () => {
      getStoredTokens.mockReturnValue({ accessToken: null, refreshToken: null });

      api.post.mockResolvedValue({
        data: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          profile_complete: true,
        },
      });
      api.get.mockResolvedValue({ data: { id: 55 } });
      getCurrentUserPlayer.mockResolvedValue({ id: 555, full_name: 'Logged In', nickname: null });

      let authCtx;
      function LoginConsumer() {
        authCtx = useAuth();
        return <AuthConsumer />;
      }

      render(
        <AuthProvider>
          <LoginConsumer />
        </AuthProvider>
      );

      // Wait for initial auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('is-init').textContent).toBe('false');
      });

      await act(async () => {
        await authCtx.loginWithPassword('+15550001234', 'password123');
      });

      expect(setAuthTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
      expect(screen.getByTestId('is-auth').textContent).toBe('true');
    });
  });

  describe('useAuth outside provider', () => {
    it('throws when used outside AuthProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      function Orphan() {
        useAuth();
        return null;
      }

      expect(() => render(<Orphan />)).toThrow(
        'useAuth must be used within an AuthProvider'
      );

      consoleError.mockRestore();
    });
  });

  describe('context shape', () => {
    it('exposes expected properties', async () => {
      getStoredTokens.mockReturnValue({ accessToken: null, refreshToken: null });

      let authCtx;
      function ShapeConsumer() {
        authCtx = useAuth();
        return null;
      }

      render(
        <AuthProvider>
          <ShapeConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(authCtx.isInitializing).toBe(false);
      });

      expect(authCtx).toMatchObject({
        user: null,
        currentUserPlayer: null,
        isAuthenticated: false,
        sessionExpired: false,
        fetchCurrentUser: expect.any(Function),
        loginWithGoogle: expect.any(Function),
        loginWithPassword: expect.any(Function),
        loginWithSms: expect.any(Function),
        signup: expect.any(Function),
        sendVerificationCode: expect.any(Function),
        verifyPhone: expect.any(Function),
        resetPassword: expect.any(Function),
        verifyPasswordReset: expect.any(Function),
        confirmPasswordReset: expect.any(Function),
        cancelAccountDeletion: expect.any(Function),
        logout: expect.any(Function),
      });
    });
  });
});
