import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SharedSessionPreview from '../SharedSessionPreview';

const { openAuthModal, panelProps } = vi.hoisted(() => ({ openAuthModal: vi.fn(), panelProps: vi.fn() }));
vi.mock('../../../contexts/AuthModalContext', () => ({ useAuthModal: () => ({ openAuthModal }) }));
vi.mock('../../layout/NavBar', () => ({ default: () => <nav aria-label="Site navigation" /> }));
vi.mock('../ActiveSessionPanel', () => ({ default: (props: unknown) => { panelProps(props); return <div>Session games</div>; } }));

describe('SharedSessionPreview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows contents and authentication actions without any mutation callbacks', () => {
    render(<SharedSessionPreview session={{ id: 1, name: 'Shared games', status: 'ACTIVE' }} matches={[]} participants={[{ player_id: 2, full_name: 'Test Player' }]} loading={false} error={null} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shared games' })).toBeInTheDocument();
    expect(screen.getByText('Test Player')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(openAuthModal).toHaveBeenCalledWith('sign-in');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(openAuthModal).toHaveBeenCalledWith('sign-up');
    const props = panelProps.mock.lastCall?.[0];
    expect(props.showPlayerInvites).toBe(false);
    expect(props.onAddMatchClick).toBeUndefined();
    expect(props.onEditMatch).toBeUndefined();
    expect(props.onSubmitClick).toBeUndefined();
    expect(props.onRequestDeleteSession).toBeUndefined();
    expect(props.onRequestLeaveSession).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(panelProps.mock.lastCall?.[0].contentVariant).toBe('clipboard');
  });

  it('keeps navigation and login accessible for a missing session', () => {
    render(<SharedSessionPreview session={null} matches={[]} participants={[]} loading={false} error="Session not found" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Session not found');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });
});
