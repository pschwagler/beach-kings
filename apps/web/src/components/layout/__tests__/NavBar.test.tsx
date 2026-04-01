/**
 * NavBar — menu coordination tests.
 *
 * Verifies that opening one dropdown closes the other so users never see two
 * menus open simultaneously.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false })),
}));

vi.mock('../../../contexts/ModalContext', () => ({
  useModal: vi.fn(() => ({ openModal: vi.fn() })),
  MODAL_TYPES: { CREATE_GAME: 'CREATE_GAME', FEEDBACK: 'FEEDBACK' },
}));

// Stub NotificationBell — not relevant to these tests
vi.mock('../../notifications/NotificationBell', () => ({
  default: () => <span data-testid="notification-bell" />,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import NavBar from '../NavBar';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavBar — menu coordination', () => {
  const defaultProps = {
    isLoggedIn: false,
    userLeagues: [],
  };

  it('renders the Leagues and User menu buttons', () => {
    render(<NavBar {...defaultProps} />);
    expect(screen.getByLabelText('Leagues menu')).toBeTruthy();
    expect(screen.getByLabelText('User menu')).toBeTruthy();
  });

  it('opens the Leagues dropdown when its button is clicked', () => {
    render(<NavBar {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Leagues menu'));

    // The dropdown renders items unique to the leagues dropdown
    expect(screen.getByText('Find Leagues')).toBeTruthy();
  });

  it('opens the User dropdown when its button is clicked', () => {
    render(<NavBar {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('User menu'));

    // Unauthenticated user sees Log In and Sign Up
    expect(screen.getByText('Log In')).toBeTruthy();
    expect(screen.getByText('Sign Up')).toBeTruthy();
  });

  it('opening LeaguesMenu closes UserMenu', () => {
    render(<NavBar {...defaultProps} />);

    // Open user menu first
    fireEvent.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Log In')).toBeTruthy();

    // Open leagues menu — user menu should close
    fireEvent.click(screen.getByLabelText('Leagues menu'));

    expect(screen.queryByText('Log In')).toBeNull();
    expect(screen.getByText('Find Leagues')).toBeTruthy();
  });

  it('opening UserMenu closes LeaguesMenu', () => {
    render(<NavBar {...defaultProps} />);

    // Open leagues menu first
    fireEvent.click(screen.getByLabelText('Leagues menu'));
    expect(screen.getByText('Find Leagues')).toBeTruthy();

    // Open user menu — leagues menu should close
    fireEvent.click(screen.getByLabelText('User menu'));

    expect(screen.queryByText('Find Leagues')).toBeNull();
    expect(screen.getByText('Log In')).toBeTruthy();
  });

  it('clicking the open LeaguesMenu button again closes it (toggle)', () => {
    render(<NavBar {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Leagues menu'));
    expect(screen.getByText('Find Leagues')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Leagues menu'));
    expect(screen.queryByText('Find Leagues')).toBeNull();
  });

  it('clicking the open UserMenu button again closes it (toggle)', () => {
    render(<NavBar {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Log In')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('User menu'));
    expect(screen.queryByText('Log In')).toBeNull();
  });

  it('both menus start closed', () => {
    render(<NavBar {...defaultProps} />);

    expect(screen.queryByText('Find Leagues')).toBeNull();
    expect(screen.queryByText('Log In')).toBeNull();
  });
});
