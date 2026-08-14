import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as Record<string, unknown> | null,
    currentUserPlayer: null as Record<string, unknown> | null,
    isAuthenticated: false,
    logout: vi.fn(),
  },
  openAuthModal: vi.fn(),
  openModal: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../../../contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal: mocks.openAuthModal }),
}));

vi.mock('../../../contexts/AppContext', () => ({
  useApp: () => ({ userLeagues: [], refreshLeagues: vi.fn() }),
}));

vi.mock('../../../contexts/ModalContext', () => ({
  MODAL_TYPES: { CREATE_LEAGUE: 'create-league' },
  useModal: () => ({ openModal: mocks.openModal }),
}));

vi.mock('../../../services/api', () => ({ createLeague: vi.fn() }));

vi.mock('../../layout/NavBar', () => ({
  default: (props: {
    isLoggedIn: boolean;
    onSignIn: () => void;
    onSignUp: () => void;
    onSignOut: () => void;
  }) => (
    <nav aria-label="Site navigation" data-authenticated={props.isLoggedIn}>
      <button onClick={props.onSignIn}>Sign in</button>
      <button onClick={props.onSignUp}>Sign up</button>
      <button onClick={props.onSignOut}>Sign out</button>
    </nav>
  ),
}));

import RouteLoadingShell from '../RouteLoadingShell';

describe('RouteLoadingShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user = null;
    mocks.auth.currentUserPlayer = null;
    mocks.auth.isAuthenticated = false;
    mocks.auth.logout.mockResolvedValue(undefined);
  });

  it('shows signed-out Navbar actions and an accessible loading status', () => {
    render(<RouteLoadingShell />);

    expect(screen.getByRole('navigation', { name: 'Site navigation' })).toHaveAttribute(
      'data-authenticated',
      'false',
    );
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(mocks.openAuthModal).toHaveBeenNthCalledWith(1, 'sign-in');
    expect(mocks.openAuthModal).toHaveBeenNthCalledWith(2, 'sign-up');
  });

  it('preserves authenticated Navbar state and signs out', async () => {
    mocks.auth.user = { id: 7 };
    mocks.auth.currentUserPlayer = { id: 11, full_name: 'Test Player' };
    mocks.auth.isAuthenticated = true;

    render(<RouteLoadingShell />);
    expect(screen.getByRole('navigation', { name: 'Site navigation' })).toHaveAttribute(
      'data-authenticated',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.auth.logout).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'));
  });
});
