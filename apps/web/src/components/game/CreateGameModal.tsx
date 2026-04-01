'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Trophy, Users, ArrowLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getUserLeagues, createSession, getOpenSessions } from '../../services/api';
import './CreateGameModal.css';
import type { League } from '../../types';

/**
 * CreateGameModal — unified entry point for creating a game.
 * Step 1: Choose League Game or Pickup Game.
 * Step 2 (league only): Pick a league from the user's leagues.
 * Step 3 (pickup only): If an active session already exists, prompt the user to
 *   continue it or start a fresh one. POST /api/sessions always creates a new
 *   session — it never finds an existing one — so the modal checks
 *   GET /api/sessions/open first to surface the choice.
 * Pickup path navigates to /session/[code].
 */

interface ActiveSessionInfo {
  id: number;
  code: string;
  date: string;
}

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateGameModal({ isOpen, onClose }: CreateGameModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [leagueLoadError, setLeagueLoadError] = useState(false);
  const [creatingPickup, setCreatingPickup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When non-null, step 1 shows the "continue or new?" dialog instead of the main options.
  const [existingSession, setExistingSession] = useState<ActiveSessionInfo | null>(null);

  // Fetch user leagues on modal open
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setError(null);
    setLeagueLoadError(false);
    setCreatingPickup(false);
    setExistingSession(null);
    let cancelled = false;

    const fetchLeagues = async () => {
      setLoadingLeagues(true);
      try {
        const data = await getUserLeagues();
        if (!cancelled) setLeagues(data || []);
      } catch (err: unknown) {
        if (!cancelled) {
          setLeagues([]);
          setLeagueLoadError(true);
        }
      } finally {
        if (!cancelled) setLoadingLeagues(false);
      }
    };
    fetchLeagues();
    return () => { cancelled = true; };
  }, [isOpen]);

  /** Close modal on Escape key. */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /** Navigate to league page with autoAddMatch flag. */
  const selectLeague = useCallback((leagueId: number) => {
    onClose();
    router.push(`/league/${leagueId}?tab=matches&autoAddMatch=true`);
  }, [onClose, router]);

  /** Handle "League Game" click from step 1. */
  const handleLeagueGame = useCallback(() => {
    if (leagues.length === 0) return;
    if (leagues.length === 1) {
      selectLeague(leagues[0].id);
      return;
    }
    setStep(2);
  }, [leagues, selectLeague]);

  /**
   * Navigate to a session by code. Shared by both "continue existing" and
   * "new session created" paths.
   */
  const navigateToSession = useCallback((code: string) => {
    onClose();
    router.push(`/session/${code}`);
  }, [onClose, router]);

  /**
   * Call the backend to create a brand-new session, then navigate to it.
   * POST /api/sessions always creates a fresh session — it never reuses an
   * existing one.
   */
  const doCreateNewSession = useCallback(async () => {
    setCreatingPickup(true);
    setError(null);
    try {
      const res = await createSession({});
      const sess = res?.session || res;
      if (sess?.code) {
        navigateToSession(sess.code);
      } else {
        setError('Session created but no share link available. Please try again.');
      }
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const detail = (e?.response as Record<string, unknown> | undefined)?.data
        ? ((e.response as Record<string, unknown>).data as Record<string, unknown>)?.detail as string | undefined
        : undefined;
      setError(detail || (e?.message as string | undefined) || 'Failed to create session');
    } finally {
      setCreatingPickup(false);
    }
  }, [navigateToSession]);

  /**
   * Handle "Pickup Game" click.
   * Checks for an existing active session first. If one is found the user is
   * prompted to continue it or start a new one. If none exists, a new session
   * is created immediately.
   */
  const handlePickupGame = useCallback(async () => {
    if (creatingPickup) return;
    setError(null);
    try {
      const sessions: Array<{ id: number; code: string; date?: string; status?: string }> =
        await getOpenSessions();
      const active = sessions.find((s) => s.status === 'ACTIVE' || !s.status);
      if (active) {
        setExistingSession({ id: active.id, code: active.code, date: active.date ?? '' });
        return;
      }
    } catch {
      // If the check fails, fall through and attempt creation; the create call
      // will surface its own error if it also fails.
    }
    await doCreateNewSession();
  }, [creatingPickup, doCreateNewSession]);

  if (!isOpen) return null;

  const hasLeagues = leagues.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content create-game-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-game-title"
      >
        {/* Header */}
        <div className="create-game-modal__header">
          {(step === 2 || existingSession) && (
            <button
              className="create-game-modal__back-btn"
              onClick={() => {
                setStep(1);
                setExistingSession(null);
              }}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 id="create-game-title" className="create-game-modal__title">
            {existingSession ? 'Active Session' : step === 1 ? 'Create Game' : 'Select League'}
          </h2>
          <button className="create-game-modal__close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="create-game-modal__error" role="alert">
            {error}
          </div>
        )}

        {/* Active session confirmation — shown when a pickup session already exists */}
        {existingSession && (
          <div className="create-game-modal__existing-session">
            <p className="create-game-modal__existing-session-text">
              You have an active session{existingSession.date ? ` from ${existingSession.date}` : ''}.
              Would you like to continue it or start a new one?
            </p>
            <div className="create-game-modal__existing-session-actions">
              <button
                className="create-game-modal__option create-game-modal__option--session"
                onClick={() => navigateToSession(existingSession.code)}
              >
                <div className="create-game-modal__option-text">
                  <span className="create-game-modal__option-label">Continue Session</span>
                  <span className="create-game-modal__option-desc">
                    Resume the session{existingSession.date ? ` from ${existingSession.date}` : ''}
                  </span>
                </div>
                <ChevronRight size={20} className="create-game-modal__option-arrow" />
              </button>
              <button
                className="create-game-modal__option create-game-modal__option--session"
                onClick={doCreateNewSession}
                disabled={creatingPickup}
              >
                <div className="create-game-modal__option-text">
                  <span className="create-game-modal__option-label">
                    {creatingPickup ? 'Creating...' : 'New Session'}
                  </span>
                  <span className="create-game-modal__option-desc">
                    Start a fresh pickup session
                  </span>
                </div>
                <ChevronRight size={20} className="create-game-modal__option-arrow" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Choose type */}
        {!existingSession && step === 1 && (
          <div className="create-game-modal__options">
            <button
              className={`create-game-modal__option ${!hasLeagues ? 'create-game-modal__option--disabled' : ''}`}
              onClick={handleLeagueGame}
              disabled={loadingLeagues || !hasLeagues}
            >
              <div className="create-game-modal__option-icon create-game-modal__option-icon--league">
                <Trophy size={28} />
              </div>
              <div className="create-game-modal__option-text">
                <span className="create-game-modal__option-label">League Game</span>
                <span className="create-game-modal__option-desc">
                  {loadingLeagues
                    ? 'Loading leagues...'
                    : hasLeagues
                      ? 'Log a game in one of your leagues'
                      : leagueLoadError
                        ? 'Could not load leagues'
                        : 'Join a league to unlock'}
                </span>
              </div>
              {hasLeagues && <ChevronRight size={20} className="create-game-modal__option-arrow" />}
            </button>

            <button
              className="create-game-modal__option"
              onClick={handlePickupGame}
              disabled={creatingPickup}
            >
              <div className="create-game-modal__option-icon create-game-modal__option-icon--pickup">
                <Users size={28} />
              </div>
              <div className="create-game-modal__option-text">
                <span className="create-game-modal__option-label">
                  {creatingPickup ? 'Creating...' : 'Pickup Game'}
                </span>
                <span className="create-game-modal__option-desc">
                  Quick game with friends — no league needed
                </span>
              </div>
              <ChevronRight size={20} className="create-game-modal__option-arrow" />
            </button>
          </div>
        )}

        {/* Step 2: Pick a league */}
        {!existingSession && step === 2 && (
          <div className="create-game-modal__leagues">
            {leagues.map((league) => (
              <button
                key={league.id}
                className="create-game-modal__league-item"
                onClick={() => selectLeague(league.id)}
              >
                <div className="create-game-modal__league-info">
                  <span className="create-game-modal__league-name">{league.name}</span>
                  {league.location_name && (
                    <span className="create-game-modal__league-location">{league.location_name}</span>
                  )}
                </div>
                <ChevronRight size={18} className="create-game-modal__option-arrow" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
