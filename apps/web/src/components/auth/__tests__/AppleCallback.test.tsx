import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, currentUserPlayer: null, logout: vi.fn() }),
}));
vi.mock('../../layout/NavBar', () => ({ default: () => <nav aria-label="Main navigation" /> }));
import AppleCallbackPage from '../../../../app/auth/apple/callback/page';

it('uses readable page heading styles and retains navigation on the public callback', () => {
  render(<AppleCallbackPage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Apple sign-in' })).toHaveClass('legal-page-title');
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return to Beach League' })).toHaveAttribute('href', '/');
});
