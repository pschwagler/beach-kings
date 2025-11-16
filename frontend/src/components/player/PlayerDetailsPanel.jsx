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
  onSideTabClick
}) {
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

