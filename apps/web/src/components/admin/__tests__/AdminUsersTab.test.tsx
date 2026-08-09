import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminUsersTab from '../AdminUsersTab';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getAdminUsers: vi.fn(),
  grantSystemAdmin: vi.fn(),
  revokeSystemAdmin: vi.fn(),
}));

const user = {
  id: 42,
  full_name: 'Morgan Sand',
  email: 'morgan@example.com',
  phone_number: null,
  auth_provider: 'google',
  is_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  deletion_scheduled_at: null,
  deleted_at: null,
  moderation_status: 'active' as const,
  moderation_expires_at: null,
  is_system_admin: false,
  role_history: [],
};

describe('AdminUsersTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getAdminUsers).mockResolvedValue({
      items: [user], page: 1, page_size: 25, total: 1, pages: 1,
    });
    vi.mocked(api.grantSystemAdmin).mockResolvedValue({});
    vi.mocked(api.revokeSystemAdmin).mockResolvedValue({});
  });

  it('shows account and role states and submits search filters', async () => {
    render(<AdminUsersTab />);
    expect(await screen.findByText('Morgan Sand')).toBeInTheDocument();
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('active').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Morgan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Morgan', page: 1 }),
    ));
  });

  it('requires a reason before confirming a grant and refreshes after success', async () => {
    render(<AdminUsersTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Grant admin' }));
    const confirm = screen.getByRole('button', { name: 'Confirm change' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Primary on-call' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.grantSystemAdmin).toHaveBeenCalledWith(42, 'Primary on-call'));
    expect(api.getAdminUsers).toHaveBeenCalledTimes(2);
  });

  it('keeps the confirmation open and displays API errors', async () => {
    vi.mocked(api.grantSystemAdmin).mockRejectedValue({
      response: { data: { detail: 'Only verified, active accounts can become system admins' } },
    });
    render(<AdminUsersTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Grant admin' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Escalation coverage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only verified, active accounts');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
