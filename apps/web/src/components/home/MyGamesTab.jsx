'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Calendar } from 'lucide-react';
import OpenSessionsList from './OpenSessionsList';
import { createSession } from '../../services/api';
import MyMatchesWidget from '../dashboard/MyMatchesWidget';
import { getPlayerMatchHistory } from '../../services/api';

/**
 * My Games tab: open sessions (where user is creator, has match, or invited) and optional recent games.
 * Clicking "Create game" starts a non-league session and navigates to /session/[code].
 */
export default function MyGamesTab({ currentUserPlayer, onTabChange, onMatchClick }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userMatches, setUserMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  useEffect(() => {
    const loadUserMatches = async () => {
      if (!currentUserPlayer?.id) return;
      setLoadingMatches(true);
      try {
        const matches = await getPlayerMatchHistory(currentUserPlayer.id);
        const sorted = (matches || []).sort((a, b) => {
          const dateA = a.Date ? new Date(a.Date).getTime() : 0;
          const dateB = b.Date ? new Date(b.Date).getTime() : 0;
          return dateB - dateA;
        });
        setUserMatches(sorted);
      } catch (err) {
        console.error('Error loading matches:', err);
        setUserMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };
    loadUserMatches();
  }, [currentUserPlayer?.id]);

  const handleCreateGame = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createSession({});
      const sess = res?.session || res;
      if (sess?.code) {
        setRefreshTrigger((t) => t + 1);
        router.push(`/session/${sess.code}`);
      } else {
        setCreateError('Session was created but no share link is available. Please try again.');
        setRefreshTrigger((t) => t + 1);
      }
    } catch (err) {
      console.error('Error creating session:', err);
      setCreateError(err.response?.data?.detail || err.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="my-games-tab-container">
      <div className="my-games-tab-header">
        <h2 className="my-games-tab-title">My Games</h2>
        <button
          type="button"
          className="my-games-tab-create-btn"
          onClick={handleCreateGame}
          disabled={creating}
        >
          <Plus size={18} />
          {creating ? 'Creating…' : 'Create game'}
        </button>
      </div>

      {createError && (
        <div className="my-games-tab-error" role="alert">
          {createError}
        </div>
      )}

      <section className="my-games-tab-section">
        <h3 className="my-games-tab-section-title">
          <Calendar size={18} />
          Open sessions
        </h3>
        <OpenSessionsList refreshTrigger={refreshTrigger} />
      </section>

      {currentUserPlayer && (
        <section className="my-games-tab-section">
          <h3 className="my-games-tab-section-title">Recent games</h3>
          <MyMatchesWidget
            matches={userMatches}
            currentUserPlayer={currentUserPlayer}
            onMatchClick={onMatchClick}
          />
        </section>
      )}
    </div>
  );
}
