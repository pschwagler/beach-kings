/**
 * PendingInvitesTab — unit tests.
 *
 * Verifies the delete button has the correct title and aria-label attributes
 * so users and screen readers receive meaningful feedback.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/api', () => ({
  listPlaceholderPlayers: vi.fn(),
  deletePlaceholderPlayer: vi.fn(),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock('../../../hooks/useShare', () => ({
  default: vi.fn(() => ({ shareInvite: vi.fn() })),
}));

vi.mock('../../modal/ConfirmationModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? React.createElement('div', { 'data-testid': 'confirmation-modal' }) : null,
}));

vi.mock('../../ui/UI', () => ({
  Button: ({
    children,
    onClick,
    title,
    'aria-label': ariaLabel,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
    'aria-label'?: string;
    className?: string;
  }) =>
    React.createElement(
      'button',
      { onClick, title, 'aria-label': ariaLabel, className },
      children,
    ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { listPlaceholderPlayers } from '../../../services/api';
import PendingInvitesTab from '../PendingInvitesTab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlaceholder(overrides: Record<string, unknown> = {}) {
  return {
    player_id: 1,
    name: 'Jane Placeholder',
    phone_number: null,
    invite_url: 'https://example.com/invite/abc',
    status: 'pending',
    match_count: 2,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingInvitesTab — delete button attributes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the delete button with title="Delete invite"', async () => {
    (listPlaceholderPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      placeholders: [makePlaceholder()],
    });

    render(<PendingInvitesTab />);

    await waitFor(() => {
      const deleteBtn = screen.getByTitle('Delete invite');
      expect(deleteBtn).toBeInTheDocument();
    });
  });

  it('renders the delete button with aria-label="Delete invite"', async () => {
    (listPlaceholderPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      placeholders: [makePlaceholder()],
    });

    render(<PendingInvitesTab />);

    await waitFor(() => {
      const deleteBtn = screen.getByRole('button', { name: 'Delete invite' });
      expect(deleteBtn).toBeInTheDocument();
    });
  });

  it('does NOT use the old placeholder text "Delete placeholder"', async () => {
    (listPlaceholderPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      placeholders: [makePlaceholder()],
    });

    render(<PendingInvitesTab />);

    await waitFor(() => {
      // wait for the list to render
      expect(screen.getByTitle('Delete invite')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Delete placeholder')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete placeholder' }),
    ).not.toBeInTheDocument();
  });

  it('renders one delete button per placeholder', async () => {
    (listPlaceholderPlayers as ReturnType<typeof vi.fn>).mockResolvedValue({
      placeholders: [
        makePlaceholder({ player_id: 1, name: 'Alice' }),
        makePlaceholder({ player_id: 2, name: 'Bob' }),
      ],
    });

    render(<PendingInvitesTab />);

    await waitFor(() => {
      const deleteBtns = screen.getAllByTitle('Delete invite');
      expect(deleteBtns).toHaveLength(2);
    });
  });
});
