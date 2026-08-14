import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetLeagueMessages = vi.fn();

vi.mock('../../../contexts/LeagueContext', () => ({
  useLeague: () => ({
    isLeagueMember: true,
    league: { id: 14, name: 'Friday Night Beach' },
  }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUserPlayer: { id: 7, name: 'Pat Player' } }),
}));

vi.mock('../../../services/api', () => ({
  getLeagueMessages: (...args: unknown[]) => mockGetLeagueMessages(...args),
  createLeagueMessage: vi.fn(),
}));

import LeagueMessagesTab from '../LeagueMessagesTab';

describe('LeagueMessagesTab', () => {
  beforeEach(() => {
    mockGetLeagueMessages.mockReset();
  });

  it('identifies the league and renders an accessible composer', async () => {
    mockGetLeagueMessages.mockResolvedValue([]);

    render(<LeagueMessagesTab leagueId={14} />);

    expect(screen.getByRole('heading', { name: 'Friday Night Beach', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('League messages')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message the league' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh league messages' })).toBeInTheDocument();

    await waitFor(() => expect(mockGetLeagueMessages).toHaveBeenCalledWith(14));
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
  });

  it('aligns the current player separately and renders uploaded author avatars', async () => {
    mockGetLeagueMessages.mockResolvedValue([
      {
        id: 1,
        player_id: 7,
        player_name: 'Pat Player',
        created_at: new Date().toISOString(),
        message: 'Courts are open.',
      },
      {
        id: 2,
        player_id: 9,
        player_name: 'Alex Setter',
        avatar_url: 'https://example.com/alex.jpg',
        created_at: new Date().toISOString(),
        message: 'See you there!',
      },
    ]);

    render(<LeagueMessagesTab leagueId={14} />);

    expect(await screen.findByText('Courts are open.')).toBeInTheDocument();
    expect(screen.getByText('Alex Setter')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Alex Setter avatar' })).toHaveAttribute(
      'src',
      'https://example.com/alex.jpg',
    );
    expect(screen.getByText('Courts are open.').closest('.message-thread-row')).toHaveClass('message-thread-row--mine');
    expect(screen.getByText('See you there!').closest('.message-thread-row')).toHaveClass('message-thread-row--theirs');
  });
});
