import { X } from 'lucide-react';
import { Button } from '../ui/UI';
import PlayerSelector from './PlayerSelector';
import PlayerOverview from './PlayerOverview';
import MatchHistoryTable from '../match/MatchHistoryTable';
import PlayerStatsTable from './PlayerStatsTable';

export default function PlayerDetails({ playerName, stats, matchHistory, onClose, allPlayers, onPlayerChange }) {
  const overview = stats?.overview || {};
  const playerStats = stats?.stats || [];
  const hasStats = playerStats.length > 0;

  return (
    <div className="player-details">
      <Button variant="close" onClick={onClose}>
        <X size={16} />
        Close
      </Button>
      
      <PlayerSelector 
        playerName={playerName}
        allPlayers={allPlayers}
        onPlayerChange={onPlayerChange}
      />

      {hasStats ? (
        <>
          <PlayerOverview overview={overview} />
          
          <MatchHistoryTable 
            matchHistory={matchHistory}
            onPlayerChange={onPlayerChange}
          />

          <PlayerStatsTable 
            playerStats={playerStats}
            onPlayerChange={onPlayerChange}
          />
        </>
      ) : (
        <div className="loading" style={{marginTop: '32px'}}>
          No stats available yet. This player's matches haven't been included in calculations.
          {matchHistory && matchHistory.length > 0 && (
            <div style={{marginTop: '16px', fontSize: '0.9em'}}>
              They have {matchHistory.length} match{matchHistory.length !== 1 ? 'es' : ''} in an active session.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

