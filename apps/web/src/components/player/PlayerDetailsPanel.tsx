import { useEffect } from 'react';
import PlayerDetails from './PlayerDetails';

interface PlayerDetailsPanelProps {
  playerId: number | null;
  playerName: string;
  playerStats: Record<string, unknown> | null | undefined;
  playerMatchHistory: Record<string, unknown>[] | null;
  isPanelOpen: boolean;
  allPlayerNames: Array<{ id: number | string; name: string }>;
  onPlayerChange: (id: number | string) => void;
  onClose: () => void;
  leagueName?: string;
  seasonName?: string;
  isPlaceholder?: boolean;
}

export default function PlayerDetailsPanel({
  playerId,
  playerName,
  playerStats,
  playerMatchHistory,
  isPanelOpen,
  allPlayerNames: allPlayers,
  onPlayerChange,
  onClose,
  leagueName,
  seasonName,
  isPlaceholder = false,
}: PlayerDetailsPanelProps) {
  // Prevent body scrolling when drawer is open
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    if (isPanelOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    
    // Cleanup on unmount
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('drawer-open');
      }
    };
  }, [isPanelOpen]);

  if (!isPanelOpen) return null;

  return (
    <>
      <div className="player-details-backdrop" onClick={onClose} />
      <PlayerDetails
        playerId={playerId}
        playerName={playerName}
        stats={playerStats}
        matchHistory={playerMatchHistory}
        onClose={onClose}
        allPlayers={allPlayers}
        onPlayerChange={onPlayerChange}
        leagueName={leagueName}
        seasonName={seasonName}
        isPlaceholder={isPlaceholder}
      />
    </>
  );
}
