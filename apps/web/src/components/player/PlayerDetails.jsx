import { X } from 'lucide-react';
import Link from 'next/link';
import PlayerSelector from './PlayerSelector';
import PlayerOverview from './PlayerOverview';
import MatchHistoryTable from '../match/MatchHistoryTable';
import PlayerStatsTable from './PlayerStatsTable';
import { slugify } from '../../utils/slugify';

export default function PlayerDetails({ playerId, playerName, stats, matchHistory, onClose, allPlayers, onPlayerChange, leagueName, seasonName }) {
  const overview = stats?.overview || {};
  const playerStats = stats?.stats || [];
  const hasStats = playerStats.length > 0;
  // Determine if this is a season view (has seasonName) or league view (All Seasons)
  const isSeason = !!seasonName;
  // For season: check for ranking/points. For league: check for games/win_rate
  const hasOverview = overview && (
    isSeason 
      ? (overview.ranking !== undefined || overview.points !== undefined || overview.rating !== undefined)
      : (overview.games !== undefined || overview.win_rate !== undefined || overview.rating !== undefined)
  );

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

      {playerId && playerName && (
        <Link
          href={`/player/${playerId}/${slugify(playerName)}`}
          className="player-details__profile-link"
          onClick={onClose}
        >
          View full profile
        </Link>
      )}

      {(leagueName || seasonName) && (
        <div className="player-details-season-name">
          {`${leagueName} - ${seasonName || 'All seasons'}`}
        </div>
      )}

      {hasOverview && (
        <PlayerOverview overview={overview} isSeason={isSeason} />
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
        <div className="loading loading-message">
          No stats available yet. This player's games haven't been included in calculations.
          {matchHistory && matchHistory.length > 0 && (
            <div className="loading-submessage">
              They have {matchHistory.length} match{matchHistory.length !== 1 ? 'es' : ''} in an active session.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
