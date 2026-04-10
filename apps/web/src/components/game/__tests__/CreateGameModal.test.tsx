/**
 * Unit tests for CreateGameModal component.
 *
 * Covers:
 * - POST /api/sessions always creates a new session (never find-or-create)
 * - If an active session exists, the user is prompted to continue or start new
 * - If no active session exists, a new session is created immediately
 * - Continues to an existing session when user chooses "Continue"
 * - Creates a new session when user chooses "New Session"
 * - Navigation to /session/[code] on success
 * - Error display on session creation failure
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}));

const mockCreateSession = vi.fn();
const mockGetOpenSessions = vi.fn();

vi.mock('../../../services/api', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  getOpenSessions: (...args: unknown[]) => mockGetOpenSessions(...args),
}));

vi.mock('../../../contexts/AppContext', () => ({
  useApp: vi.fn(() => ({ userLeagues: [], leaguesLoading: false })),
}));

import CreateGameModal from '../CreateGameModal';

const onClose = vi.fn();

const renderModal = (isOpen = true) =>
  render(<CreateGameModal isOpen={isOpen} onClose={onClose} />);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenSessions.mockResolvedValue([]);
});

describe('CreateGameModal — Pickup Game flow', () => {
  it('creates a new session and navigates when no active sessions exist', async () => {
    mockGetOpenSessions.mockResolvedValue([]);
    mockCreateSession.mockResolvedValue({ session: { code: 'ABC123' } });

    renderModal();

    const pickupButton = await screen.findByText('Pickup Game');
    fireEvent.click(pickupButton);

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/session/ABC123');
    });
  });

  it('shows existing-session dialog when an active session exists', async () => {
    mockGetOpenSessions.mockResolvedValue([
      { id: 7, code: 'EXIST1', date: '6/1/2025', status: 'ACTIVE' },
    ]);

    renderModal();

    const pickupButton = await screen.findByText('Pickup Game');
    fireEvent.click(pickupButton);

    // The paragraph contains the key message; the h2 also says "Active Session"
    await screen.findByText(/you have an active session/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('navigates to existing session when user chooses Continue', async () => {
    mockGetOpenSessions.mockResolvedValue([
      { id: 7, code: 'EXIST1', date: '6/1/2025', status: 'ACTIVE' },
    ]);

    renderModal();

    const pickupButton = await screen.findByText('Pickup Game');
    fireEvent.click(pickupButton);

    const continueButton = await screen.findByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/session/EXIST1');
    });
  });

  it('creates a new session when user chooses New Session', async () => {
    mockGetOpenSessions.mockResolvedValue([
      { id: 7, code: 'EXIST1', date: '6/1/2025', status: 'ACTIVE' },
    ]);
    mockCreateSession.mockResolvedValue({ session: { code: 'NEW99' } });

    renderModal();

    const pickupButton = await screen.findByText('Pickup Game');
    fireEvent.click(pickupButton);

    await screen.findByText(/you have an active session/i);

    const newButton = await screen.findByRole('button', { name: /new session/i });
    fireEvent.click(newButton);

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/session/NEW99');
    });
  });

  it('shows error message when session creation fails', async () => {
    mockGetOpenSessions.mockResolvedValue([]);
    mockCreateSession.mockRejectedValue(new Error('Network error'));

    renderModal();

    const pickupButton = await screen.findByText('Pickup Game');
    fireEvent.click(pickupButton);

    await screen.findByRole('alert');
  });

  it('does not render when isOpen is false', () => {
    renderModal(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
