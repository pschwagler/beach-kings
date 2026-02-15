'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Trophy, Users, ArrowLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getUserLeagues, createSession } from '../../services/api';
import './CreateGameModal.css';

/**
 * CreateGameModal — unified entry point for creating a game.
 * Step 1: Choose League Game or Pickup Game.
 * Step 2 (league only): Pick a league from the user's leagues.
 * Pickup path creates a session inline and navigates to /session/[code].
 */
export default function CreateGameModal({ isOpen, onClose }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [leagues, setLeagues] = useState([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [leagueLoadError, setLeagueLoadError] = useState(false);
  const [creatingPickup, setCreatingPickup] = useState(false);
  const [error, setError] = useState(null);

  // Fetch user leagues on modal open
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setError(null);
    setLeagueLoadError(false);
    setCreatingPickup(false);
    let cancelled = false;

    const fetchLeagues = async () => {
      setLoadingLeagues(true);
      try {
        const data = await getUserLeagues();
        if (!cancelled) setLeagues(data || []);
      } catch (err) {
        console.error('Error fetching user leagues:', err);
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
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /** Navigate to league page with autoAddMatch flag. */
  const selectLeague = useCallback((leagueId) => {
    onClose();
    router.push(`/league/${leagueId}?tab=matches&autoAddMatch=true`);
  }, [onClose, router]);

  /** Handle "League Game" click from step 1. */
  const handleLeagueGame = useCallback(() => {
    if (leagues.length === 0) return;
    if (leagues.length === 1) {
      // Auto-select the only league
      selectLeague(leagues[0].id);
      return;
    }
    setStep(2);
  }, [leagues, selectLeague]);

  /** Handle "Pickup Game" click — create session and navigate. */
  const handlePickupGame = useCallback(async () => {
    if (creatingPickup) return;
    setCreatingPickup(true);
    setError(null);
    try {
      const res = await createSession({});
      const sess = res?.session || res;
      if (sess?.code) {
        onClose();
        router.push(`/session/${sess.code}`);
      } else {
        setError('Session created but no share link available. Please try again.');
      }
    } catch (err) {
      console.error('Error creating pickup session:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to create session');
    } finally {
      setCreatingPickup(false);
    }
  }, [creatingPickup, onClose, router]);

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
          {step === 2 && (
            <button
              className="create-game-modal__back-btn"
              onClick={() => setStep(1)}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 id="create-game-title" className="create-game-modal__title">
            {step === 1 ? 'Create Game' : 'Select League'}
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

        {/* Step 1: Choose type */}
        {step === 1 && (
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
        {step === 2 && (
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
