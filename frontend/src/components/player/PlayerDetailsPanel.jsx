import { useEffect } from 'react';
import PlayerDetails from './PlayerDetails';

export default function PlayerDetailsPanel({
  selectedPlayer,
  playerStats,
  playerMatchHistory,
  isPanelOpen,
  allPlayerNames,
  onPlayerChange,
  onClose,
  leagueName,
  seasonName
}) {
  // Prevent body scrolling when drawer is open
  useEffect(() => {
    if (isPanelOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('drawer-open');
    };
  }, [isPanelOpen]);

  if (!isPanelOpen) return null;

  return (
    <>
      <div className="player-details-backdrop" onClick={onClose} />
      <PlayerDetails
        playerName={selectedPlayer}
        stats={playerStats}
        matchHistory={playerMatchHistory}
        onClose={onClose}
        allPlayers={allPlayerNames}
        onPlayerChange={onPlayerChange}
        leagueName={leagueName}
        seasonName={seasonName}
      />
    </>
  );
}

