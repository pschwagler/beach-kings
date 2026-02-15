'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { Button } from '../ui/UI';
import OpenSessionsList from './OpenSessionsList';
import MyMatchesWidget from '../dashboard/MyMatchesWidget';
import { getPlayerMatchHistory } from '../../services/api';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';

/**
 * My Games tab: open sessions (where user is creator, has match, or invited) and optional recent games.
 * Clicking "Create game" opens the CreateGameModal to choose league vs pickup.
 */
export default function MyGamesTab({ currentUserPlayer, onTabChange, onMatchClick }) {
  const { openModal } = useModal();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userMatches, setUserMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Refresh open sessions when page becomes visible (e.g., returning from session page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setRefreshTrigger((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  const handleCreateGame = () => {
    openModal(MODAL_TYPES.CREATE_GAME);
  };

  return (
    <div className="my-games-tab-container">
      <div className="my-games-tab-header">
        <h2 className="my-games-tab-title">My Games</h2>
        <Button
          variant="outline"
          onClick={handleCreateGame}
          className="my-games-tab-create-btn"
        >
          <Plus size={18} />
          Create game
        </Button>
      </div>

      <section className="my-games-tab-section">
        <h3 className="my-games-tab-section-title">
          <Calendar size={18} />
          Open sessions
        </h3>
        <OpenSessionsList refreshTrigger={refreshTrigger} currentUserPlayerId={currentUserPlayer?.id} />
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
