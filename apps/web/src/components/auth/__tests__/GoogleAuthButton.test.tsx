import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('@react-oauth/google', () => ({ useGoogleOAuth: () => ({ clientId: 'test-client', scriptLoadedSuccessfully: true }) }));
vi.mock('../../../services/api', () => ({ getStoredTokens: vi.fn(() => ({ accessToken: 'account-a' })) }));
import { getStoredTokens } from '../../../services/api';
import GoogleAuthButton, { GoogleCredentialResponse } from '../GoogleAuthButton';

let callback: (response: GoogleCredentialResponse) => void;
let buttons: { state: string; click_listener: () => void }[];
beforeEach(() => {
  buttons = [];
  vi.mocked(getStoredTokens).mockReturnValue({ accessToken: 'account-a', refreshToken: null });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private notify: (entries: unknown[]) => void) {}
    observe() { this.notify([{ contentRect: { width: 300 } }]); }
    disconnect() {}
  });
  Object.assign(window, { google: { accounts: { id: {
    initialize: (config: { callback: typeof callback }) => { callback = config.callback; },
    renderButton: (_: unknown, options: { state: string; click_listener: () => void }) => { buttons.push(options); },
  } } } });
});

it('routes credentials only to the clicked button when two are mounted', async () => {
  const first = vi.fn(); const second = vi.fn();
  render(<><GoogleAuthButton onSuccess={first} onError={vi.fn()} /><GoogleAuthButton onSuccess={second} onError={vi.fn()} /></>);
  await waitFor(() => expect(buttons).toHaveLength(2));
  act(() => { buttons[0].click_listener(); callback({ credential: 'token', state: buttons[0].state }); });
  expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
});

it('rejects completion when the session changes after the actual click', async () => {
  const success = vi.fn(); const error = vi.fn();
  render(<GoogleAuthButton onSuccess={success} onError={error} />);
  await waitFor(() => expect(buttons).toHaveLength(1));
  act(() => buttons[0].click_listener());
  vi.mocked(getStoredTokens).mockReturnValue({ accessToken: 'account-b', refreshToken: null });
  act(() => callback({ credential: 'token', state: buttons[0].state }));
  expect(success).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledOnce();
});

it('does not deliver an old popup to a new account component', async () => {
  const oldHandler = vi.fn(); const newHandler = vi.fn();
  const mounted = render(<GoogleAuthButton onSuccess={oldHandler} onError={vi.fn()} />);
  await waitFor(() => expect(buttons).toHaveLength(1));
  const oldButton = buttons[0];
  act(() => oldButton.click_listener());
  mounted.unmount();
  render(<GoogleAuthButton onSuccess={newHandler} onError={vi.fn()} />);
  await waitFor(() => expect(buttons).toHaveLength(2));
  act(() => callback({ credential: 'token', state: oldButton.state }));
  expect(oldHandler).not.toHaveBeenCalled(); expect(newHandler).not.toHaveBeenCalled();
});
