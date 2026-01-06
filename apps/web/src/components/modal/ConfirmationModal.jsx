import { useMemo, useState } from 'react';
import { X, Trophy, Users } from 'lucide-react';
import { Button } from '../ui/UI';

// Helper function to calculate player statistics from matches
function calculatePlayerStats(matches) {
  const playerStats = {};
  
  matches.forEach(match => {
    const team1Players = [match['Team 1 Player 1'], match['Team 1 Player 2']].filter(Boolean);
    const team2Players = [match['Team 2 Player 1'], match['Team 2 Player 2']].filter(Boolean);
    const team1Score = parseInt(match['Team 1 Score']) || 0;
    const team2Score = parseInt(match['Team 2 Score']) || 0;
    
    // Determine winner from scores if not explicitly set
    let winner = match.Winner;
    if (!winner || (winner !== 'Team 1' && winner !== 'Team 2')) {
      if (team1Score > team2Score) {
        winner = 'Team 1';
      } else if (team2Score > team1Score) {
        winner = 'Team 2';
      } else {
        // Skip ties (shouldn't happen based on validation, but handle gracefully)
        return;
      }
    }
    
    // Initialize player stats if not exists
    [...team1Players, ...team2Players].forEach(player => {
      if (!playerStats[player]) {
        playerStats[player] = {
          name: player,
          wins: 0,
          losses: 0,
          pointDifferential: 0
        };
      }
    });
    
    // Calculate wins/losses and point differential
    if (winner === 'Team 1') {
      team1Players.forEach(player => {
        playerStats[player].wins++;
        playerStats[player].pointDifferential += (team1Score - team2Score);
      });
      team2Players.forEach(player => {
        playerStats[player].losses++;
        playerStats[player].pointDifferential += (team2Score - team1Score);
      });
    } else if (winner === 'Team 2') {
      team2Players.forEach(player => {
        playerStats[player].wins++;
        playerStats[player].pointDifferential += (team2Score - team1Score);
      });
      team1Players.forEach(player => {
        playerStats[player].losses++;
        playerStats[player].pointDifferential += (team1Score - team2Score);
      });
    }
  });
  
  // Convert to array and sort by name
  return Object.values(playerStats).sort((a, b) => a.name.localeCompare(b.name));
}

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  gameCount,
  playerCount,
  matches,
  season
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const playerStats = useMemo(() => {
    if (!matches || matches.length === 0) return [];
    return calculatePlayerStats(matches);
  }, [matches]);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Error during confirmation:', error);
      // Keep modal open on error so user can see what happened
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <div className="modal-header-right">
            {season && (
              <span className="season-badge">
                {season.name || `Season ${season.id}`}
              </span>
            )}
            <Button variant="close" onClick={onClose} disabled={isSubmitting}>
              <X size={20} />
            </Button>
          </div>
        </div>

        <div className="modal-body">
          {(gameCount !== undefined || playerCount !== undefined) && (
            <div className="modal-stats">
              {gameCount !== undefined && (
                <div className="modal-stat">
                  <Trophy size={18} />
                  {gameCount} {gameCount === 1 ? 'game' : 'games'}
                </div>
              )}
              {playerCount !== undefined && (
                <div className="modal-stat">
                  <Users size={18} />
                  {playerCount} {playerCount === 1 ? 'player' : 'players'}
                </div>
              )}
            </div>
          )}
          
          {playerStats.length > 0 && (
            <div className="modal-player-stats">
              <table className="modal-stats-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Point Differential</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((player, idx) => (
                    <tr key={idx}>
                      <td className="modal-stats-table-name">{player.name}</td>
                      <td>{player.wins}</td>
                      <td>{player.losses}</td>
                      <td>{player.pointDifferential > 0 ? '+' : ''}{player.pointDifferential}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <p>{message}</p>
        </div>

        <div className="modal-actions">
          <Button onClick={onClose} disabled={isSubmitting}>
            {cancelText}
          </Button>
          <Button variant="success" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
