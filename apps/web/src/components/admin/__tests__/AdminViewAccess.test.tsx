import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminView from '../AdminView';

const push = vi.fn();
const openAuthModal = vi.fn();
let auth = {
  user: null as null | { id: number; phone: string; is_system_admin?: boolean },
  currentUserPlayer: null,
  isAuthenticated: false,
  isInitializing: false,
  logout: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal }),
}));
vi.mock('../../../contexts/AppContext', () => ({ useApp: () => ({ userLeagues: [] }) }));
vi.mock('../../layout/NavBar', () => ({ default: () => <nav>Beach League navigation</nav> }));
vi.mock('../AdminDashboardTab', () => ({ default: () => <div>Dashboard content</div> }));
vi.mock('../AdminSettingsTab', () => ({ default: () => <div>Settings content</div> }));
vi.mock('../AdminCourtsTab', () => ({ default: () => <div>Courts content</div> }));
vi.mock('../AdminFeedbackTab', () => ({ default: () => <div>Feedback content</div> }));
vi.mock('../AdminModerationTab', () => ({ default: () => <div>Moderation content</div> }));
vi.mock('../AdminUsersTab', () => ({ default: () => <div>Users content</div> }));

describe('AdminView access boundary', () => {
  beforeEach(() => {
    push.mockReset();
    openAuthModal.mockReset();
    auth = { user: null, currentUserPlayer: null, isAuthenticated: false, isInitializing: false, logout: vi.fn() };
  });

  it('keeps the Navbar on the signed-out state and opens sign in', () => {
    render(<AdminView />);
    expect(screen.getByText('Beach League navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(openAuthModal).toHaveBeenCalledWith('sign-in');
  });

  it('keeps the Navbar while denying authenticated non-admins', () => {
    auth = { ...auth, user: { id: 3, phone: '', is_system_admin: false }, isAuthenticated: true };
    render(<AdminView />);
    expect(screen.getByText('Beach League navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('renders admin tabs for a live system-admin assignment', () => {
    auth = { ...auth, user: { id: 4, phone: '', is_system_admin: true }, isAuthenticated: true };
    render(<AdminView />);
    expect(screen.getByRole('button', { name: /Users/ })).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });
});
