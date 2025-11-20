import { useEffect } from 'react';
import PlayerDetails from './PlayerDetails';
import PlayerDetailsSideTab from './PlayerDetailsSideTab';

export default function PlayerDetailsPanel({
  selectedPlayer,
  playerStats,
  playerMatchHistory,
  isPanelOpen,
  allPlayerNames,
  onPlayerChange,
  onClose,
  onSideTabClick,
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

  return (
    <>
      {/* Backdrop - only shown when panel is open */}
      {isPanelOpen && (
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
      )}

      {/* Side Tab - only shown when panel is closed */}
      <PlayerDetailsSideTab
        onClick={onSideTabClick}
        isVisible={!isPanelOpen}
      />
    </>
  );
}

