import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  getRequests: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../../contexts/LeagueContext', () => ({ useLeague: () => mocks.context }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUserPlayer: null }) }));
vi.mock('../../../contexts/AppContext', () => ({ useApp: () => ({ locations: [] }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../../services/api', () => ({
  getLeagueJoinRequests: (...args: unknown[]) => mocks.getRequests(...args),
  removeLeagueMember: vi.fn(),
  updateLeagueMember: vi.fn(),
  leaveLeague: vi.fn(),
}));
vi.mock('../hooks/useSortedMembers', () => ({ useSortedMembers: () => [] }));
vi.mock('../DescriptionSection', () => ({ default: () => null }));
vi.mock('../PlayersSection', () => ({ default: () => null }));
vi.mock('../SeasonsSection', () => ({ default: () => null }));
vi.mock('../LeagueInfoSection', () => ({ default: () => null }));
vi.mock('../AddPlayersModal', () => ({ default: () => null }));
vi.mock('../CreateSeasonModal', () => ({ default: () => null }));
vi.mock('../../modal/ConfirmationModal', () => ({ default: () => null }));
vi.mock('../JoinRequestsSection', () => ({
  default: ({ pendingRequests }: { pendingRequests: { id: number; player_name: string }[] }) => (
    <div data-testid="join-requests">
      {pendingRequests.map(request => <span key={request.id}>{request.player_name}</span>)}
    </div>
  ),
}));

import LeagueDetailsTab from '../LeagueDetailsTab';

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context = {
    leagueId: 1,
    league: { id: 1, name: 'Test League', is_open: true },
    isLeagueAdmin: true,
    isLeagueMember: true,
    members: [],
    seasons: [],
    refreshMembers: vi.fn(),
    refreshSeasons: vi.fn(),
    updateLeague: vi.fn(),
    updateMember: vi.fn(),
  };
  mocks.getRequests.mockResolvedValue({ pending: [], rejected: [] });
});

describe('league details join requests', () => {
  it('does not fetch or show join requests for an invite-only league admin', async () => {
    mocks.context.league = { id: 1, is_open: false };
    render(<LeagueDetailsTab />);
    await act(async () => {});
    expect(mocks.getRequests).not.toHaveBeenCalled();
    expect(screen.queryByTestId('join-requests')).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('waits for the league policy before fetching requests', async () => {
    mocks.context.league = null;
    const view = render(<LeagueDetailsTab />);
    expect(mocks.getRequests).not.toHaveBeenCalled();
    mocks.context.league = { id: 1 };
    view.rerender(<LeagueDetailsTab />);
    expect(mocks.getRequests).not.toHaveBeenCalled();
    mocks.context.league = { id: 1, is_open: true };
    view.rerender(<LeagueDetailsTab />);
    await waitFor(() => expect(mocks.getRequests).toHaveBeenCalledWith(1));
  });

  it('does not fetch requests for ordinary members', async () => {
    mocks.context.isLeagueAdmin = false;
    render(<LeagueDetailsTab />);
    await act(async () => {});
    expect(mocks.getRequests).not.toHaveBeenCalled();
    expect(screen.queryByTestId('join-requests')).not.toBeInTheDocument();
  });

  it('loads requests for an open league admin', async () => {
    mocks.getRequests.mockResolvedValue({ pending: [{ id: 7, player_name: 'Current request' }] });
    render(<LeagueDetailsTab />);
    expect(await screen.findByText('Current request')).toBeInTheDocument();
    expect(mocks.getRequests).toHaveBeenCalledWith(1);
  });

  it('ignores a previous league response after navigation', async () => {
    const old = deferred();
    mocks.getRequests.mockReturnValueOnce(old.promise);
    const view = render(<LeagueDetailsTab />);
    mocks.context = { ...mocks.context, leagueId: 2 };
    view.rerender(<LeagueDetailsTab />);
    expect(mocks.getRequests).toHaveBeenCalledTimes(1);
    mocks.getRequests.mockResolvedValue({ pending: [{ id: 8, player_name: 'Current request' }] });
    mocks.context.league = { id: 2, is_open: true };
    view.rerender(<LeagueDetailsTab />);
    expect(await screen.findByText('Current request')).toBeInTheDocument();
    await act(async () => old.resolve({ pending: [{ id: 7, player_name: 'Old request' }] }));
    expect(screen.queryByText('Old request')).not.toBeInTheDocument();
    expect(screen.getByText('Current request')).toBeInTheDocument();
  });

  it('ignores a stale error after the league becomes invite-only', async () => {
    const old = deferred();
    mocks.getRequests.mockReturnValueOnce(old.promise);
    const view = render(<LeagueDetailsTab />);
    mocks.context.league = { id: 1, is_open: false };
    view.rerender(<LeagueDetailsTab />);
    await act(async () => old.reject({ response: { data: { detail: 'Membership requires an invitation.' } } }));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(screen.queryByTestId('join-requests')).not.toBeInTheDocument();
  });

  it('ignores request errors after unmount', async () => {
    const old = deferred();
    mocks.getRequests.mockReturnValueOnce(old.promise);
    const view = render(<LeagueDetailsTab />);
    view.unmount();
    await act(async () => old.reject(new Error('Previous page failed')));
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('still reports a current open-league request failure', async () => {
    mocks.getRequests.mockRejectedValue({ response: { data: { detail: 'Could not load requests' } } });
    render(<LeagueDetailsTab />);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Could not load requests', 'error'));
  });
});
