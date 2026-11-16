'use client';

import { useState } from 'react';
import { Calendar, ClipboardList, LayoutList, MapPin } from 'lucide-react';
import NavBar from '../layout/NavBar';
import ActiveSessionPanel from './ActiveSessionPanel';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { formatDate } from '../../utils/dateUtils';
import type { Session } from '../../types';
import type { DisplayMatch } from '../league/utils/matchUtils';
import './SharedSessionPreview.css';

interface Props {
  session: Session | null;
  matches: DisplayMatch[];
  participants: { player_id: number; full_name: string }[];
  loading: boolean;
  error: string | null;
}

/** A guest view has no mutation callbacks or authenticated player popovers. */
export default function SharedSessionPreview({ session, matches, participants, loading, error }: Props) {
  const { openAuthModal } = useAuthModal();
  const [view, setView] = useState('cards');

  return (
    <>
      <NavBar
        isLoggedIn={false}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <main className="session-page shared-session-preview">
        <div className="shared-session-preview-toolbar">
          <span>Viewing a shared session</span>
          <div className="shared-session-preview-auth">
            <button type="button" className="shared-session-preview-login" onClick={() => openAuthModal('sign-in')}>Log in</button>
            <button type="button" className="shared-session-preview-signup" onClick={() => openAuthModal('sign-up')}>Sign up</button>
          </div>
        </div>
        {loading ? <p role="status">Loading session…</p> : error || !session ? (
          <p role="alert">{error || 'Session not found'}</p>
        ) : (
          <>
            <header className="session-page-header">
              <p className="secondary-text">Shared session · Read only</p>
              <h1 className="session-page-title">{session.name || 'Session'}</h1>
              <div className="session-page-meta">
                <span className={`open-sessions-list-badge ${session.league_id ? 'league' : 'pickup'}`}>
                  {session.league_id ? 'League' : 'Pickup'}
                </span>
                {session.date && <span className="session-page-date"><Calendar size={16} /> {formatDate(session.date)}</span>}
                {session.court_name && <span className="session-page-court"><MapPin size={16} /> {session.court_name}</span>}
              </div>
            </header>
            <section aria-label="Session players" className="shared-session-preview-players">
              <h2>Players ({participants.length})</h2>
              <p>{participants.length ? participants.map((p) => p.full_name).join(' · ') : 'No players yet.'}</p>
            </section>
            <div className="view-toggle" style={{ marginBottom: 16 }}>
              <button type="button" className={`view-toggle-button ${view === 'cards' ? 'active' : ''}`} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                <LayoutList size={18} /> Cards
              </button>
              <button type="button" className={`view-toggle-button ${view === 'clipboard' ? 'active' : ''}`} aria-pressed={view === 'clipboard'} onClick={() => setView('clipboard')}>
                <ClipboardList size={18} /> Table
              </button>
            </div>
            <ActiveSessionPanel
              showPlayerInvites={false}
              activeSession={session}
              activeSessionMatches={matches}
              variant="non-league"
              contentVariant={view}
              isSubmitted={session.status !== 'ACTIVE'}
            />
          </>
        )}
      </main>
    </>
  );
}
