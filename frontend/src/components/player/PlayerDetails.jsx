import { X } from 'lucide-react';
import PlayerSelector from './PlayerSelector';
import PlayerOverview from './PlayerOverview';
import MatchHistoryTable from '../match/MatchHistoryTable';
import PlayerStatsTable from './PlayerStatsTable';

export default function PlayerDetails({ playerName, stats, matchHistory, onClose, allPlayers, onPlayerChange, leagueName, seasonName }) {
  const overview = stats?.overview || {};
  const playerStats = stats?.stats || [];
  const hasStats = playerStats.length > 0;
  const hasOverview = overview && (overview.ranking !== undefined || overview.points !== undefined || overview.rating !== undefined);

  return (
    <div className="player-details">
      <button className="player-details-close-btn" onClick={onClose} aria-label="Close player details">
        <X size={20} />
      </button>
      
      <PlayerSelector 
        playerName={playerName}
        allPlayers={allPlayers}
        onPlayerChange={onPlayerChange}
      />

      {(leagueName || seasonName) && (
        <div className="player-details-season-name">
          {leagueName && seasonName ? `${leagueName} - ${seasonName}` : leagueName || seasonName}
        </div>
      )}

      {hasOverview && (
        <PlayerOverview overview={overview} />
      )}

      {matchHistory && matchHistory.length > 0 && (
        <MatchHistoryTable 
          matchHistory={matchHistory}
          onPlayerChange={onPlayerChange}
        />
      )}

      {hasStats ? (
        <PlayerStatsTable 
          playerStats={playerStats}
          onPlayerChange={onPlayerChange}
        />
      ) : !hasOverview && (
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

