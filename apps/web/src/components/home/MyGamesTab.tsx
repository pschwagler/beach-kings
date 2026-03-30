'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/UI';
import { MySessionsWidget } from './OpenSessionsList';
import MyMatchesWidget, { type MatchRecord } from '../dashboard/MyMatchesWidget';
import { getPlayerMatchHistory } from '../../services/api';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';

/**
 * My Games tab: sessions and match history side-by-side on desktop, stacked on mobile.
 * Both lists render in "full" mode — no widget chrome, all items visible, natural page flow.
 */
import type { Player } from '../../types';

interface MyGamesTabProps {
  currentUserPlayer: Player | null;
  onTabChange: (tab: string) => void;
  onMatchClick: (match: MatchRecord) => void;
}

export default function MyGamesTab({ currentUserPlayer, onTabChange, onMatchClick }: MyGamesTabProps) {
  const { openModal } = useModal();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userMatches, setUserMatches] = useState<MatchRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

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
        const sorted = ((matches || []) as MatchRecord[]).sort((a, b) => {
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

      <div className="my-games-tab-grid">
        <div className="my-games-tab-col">
          <MySessionsWidget
            variant="full"
            refreshTrigger={refreshTrigger}
            currentUserPlayerId={currentUserPlayer?.id}
          />
        </div>
        {currentUserPlayer && (
          <div className="my-games-tab-col">
            <MyMatchesWidget
              variant="full"
              matches={userMatches}
              currentUserPlayer={currentUserPlayer}
              onMatchClick={onMatchClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
