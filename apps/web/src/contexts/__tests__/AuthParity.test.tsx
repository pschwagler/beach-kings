import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthTokens: vi.fn(), clearAuthTokens: vi.fn(),
  getStoredTokens: vi.fn(() => ({})), logout: vi.fn(),
  getCurrentUserPlayer: vi.fn(), cancelAccountDeletion: vi.fn(),
}));
import api, { setAuthTokens, getCurrentUserPlayer, getStoredTokens } from '../../services/api';
import { AuthProvider, useAuth } from '../AuthContext';

let auth: ReturnType<typeof useAuth>;
function Consumer() {
  const context = useAuth();
  useEffect(() => { auth = context; }, [context]);
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getStoredTokens).mockReturnValue({ accessToken: null, refreshToken: null });
  vi.mocked(api.post).mockResolvedValue({ data: { access_token: 'test-access', refresh_token: 'test-refresh', profile_complete: true } });
  vi.mocked(api.get).mockResolvedValue({ data: { id: 1 } });
  vi.mocked(getCurrentUserPlayer).mockResolvedValue({ id: 2 } as never);
  render(<AuthProvider><Consumer /></AuthProvider>);
  await waitFor(() => expect(auth.isInitializing).toBe(false));
});

it('logs in with normalized email without sending a phone identifier', async () => {
  await act(() => auth.loginWithPassword(' Person@Example.com ', 'password'));
  expect(api.post).toHaveBeenCalledWith('/api/auth/login', { email: 'person@example.com', password: 'password' });
  expect(setAuthTokens).toHaveBeenCalledWith('test-access', 'test-refresh');
});

it('preserves phone password and SMS login', async () => {
  await act(() => auth.loginWithPassword('+15555550123', 'password'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/login', { phone_number: '+15555550123', password: 'password' });
  await act(() => auth.loginWithSms('+15555550123', '123456'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/sms-login', { phone_number: '+15555550123', code: '123456' });
});

it('supports email-only signup and uses the email signup verification endpoints', async () => {
  await act(() => auth.signup({ email: 'person@example.com', password: 'test-password', firstName: 'Test', lastName: 'Player', eligibilityToken: 'test-eligibility' }));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/signup', expect.objectContaining({ email: 'person@example.com', phone_number: undefined, eligibility_token: 'test-eligibility' }));
  await act(() => auth.sendVerificationCode('person@example.com'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/send-email-verification', { email: 'person@example.com' });
  await act(() => auth.verifyPhone('person@example.com', '123456'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/verify-email', { email: 'person@example.com', code: '123456' });
});

it('uses the existing email recovery endpoints and shared confirmation', async () => {
  await act(() => auth.resetPassword('person@example.com'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/reset-password-email', { email: 'person@example.com' });
  await act(() => auth.verifyPasswordReset('person@example.com', '123456'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/reset-password-email-verify', { email: 'person@example.com', code: '123456' });
  await act(() => auth.confirmPasswordReset('test-reset', 'new-password'));
  expect(api.post).toHaveBeenLastCalledWith('/api/auth/reset-password-confirm', { reset_token: 'test-reset', new_password: 'new-password' });
});

it('completes Apple using browser credentials and the centralized auth transition', async () => {
  await act(() => auth.completeAppleLogin({ id_token: 'test-id', code: 'test-code', state: 'test-state' }, 'test-eligibility'));
  expect(api.post).toHaveBeenCalledWith('/api/auth/apple/web/complete', { id_token: 'test-id', authorization_code: 'test-code', state: 'test-state', eligibility_token: 'test-eligibility' }, { withCredentials: true });
  expect(setAuthTokens).toHaveBeenCalledWith('test-access', 'test-refresh');
});

it('does not publish Apple credentials if the account changes during completion', async () => {
  let finish!: (response: unknown) => void;
  vi.mocked(api.post).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = auth.completeAppleLogin({ id_token: 'test-id', code: 'test-code', state: 'test-state' });
  vi.mocked(getStoredTokens).mockReturnValue({ accessToken: 'different-account', refreshToken: 'different-refresh' });
  finish({ data: { access_token: 'stale-apple', refresh_token: 'stale-refresh' } });
  await expect(pending).rejects.toThrow('Your account changed');
  expect(setAuthTokens).not.toHaveBeenCalled();
});

it('does not publish Apple credentials after the initiating UI is closed', async () => {
  const controller = new AbortController();
  let finish!: (response: unknown) => void;
  vi.mocked(api.post).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = auth.completeAppleLogin({ id_token: 'test-id', code: 'test-code', state: 'test-state' }, undefined, controller.signal);
  controller.abort();
  finish({ data: { access_token: 'stale-apple', refresh_token: 'stale-refresh' } });
  await expect(pending).rejects.toThrow('Your account changed');
  expect(setAuthTokens).not.toHaveBeenCalled();
});
