import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() }, getStoredTokens: vi.fn(() => ({ accessToken: null })) }));
vi.mock('next/script', () => ({ default: ({ onReady, onError }: { onReady: () => void; onError: () => void }) => <><button onClick={onReady}>Load Apple SDK</button><button onClick={onError}>Fail Apple SDK</button></> }));
import api from '../../../services/api';
import AppleAuthButton from '../AppleAuthButton';
const configuration = { clientId: 'com.example.web', redirectURI: 'https://beachleaguevb.com/auth/apple/callback', state: 'test-state', nonce: 'test-nonce' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { enabled: true } });
  vi.mocked(api.post).mockResolvedValue({ data: configuration });
  window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn().mockResolvedValue({ authorization: { state: 'test-state', id_token: 'test-token', code: 'test-code' } }) } };
});

it('prepares browser credentials before launching the popup on click', async () => {
  const success = vi.fn().mockResolvedValue(undefined);
  render(<AppleAuthButton onSuccess={success} onError={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load Apple SDK' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeEnabled());
  expect(api.post).toHaveBeenCalledWith('/api/auth/apple/web/start', {}, expect.objectContaining({ withCredentials: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Apple' }));
  expect(window.AppleID?.auth.signIn).toHaveBeenCalledOnce();
  await waitFor(() => expect(success).toHaveBeenCalledWith({ state: 'test-state', id_token: 'test-token', code: 'test-code' }, expect.any(AbortSignal)));
});

it('rejects a mismatched state without completing authorization', async () => {
  vi.mocked(window.AppleID!.auth.signIn).mockResolvedValue({ authorization: { state: 'different-state', id_token: 'test-token', code: 'test-code' } });
  const success = vi.fn(); const error = vi.fn();
  render(<AppleAuthButton onSuccess={success} onError={error} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load Apple SDK' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Apple' }));
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(success).not.toHaveBeenCalled();
});

it('uses the account-bound start endpoint for connection settings', async () => {
  render(<AppleAuthButton linking onSuccess={vi.fn()} onError={vi.fn()} />);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/auth/apple/web/link/start', {}, expect.objectContaining({ withCredentials: true })));
});

it('shows unavailable configuration without attempting authorization', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { enabled: false } });
  render(<AppleAuthButton onSuccess={vi.fn()} onError={vi.fn()} />);
  expect(await screen.findByText(/not available yet/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it('provides an actionable page reload after SDK load failure', async () => {
  render(<AppleAuthButton onSuccess={vi.fn()} onError={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fail Apple SDK' }));
  expect(screen.getByRole('button', { name: 'reload this page' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Retry Apple sign-in' })).not.toBeInTheDocument();
});
