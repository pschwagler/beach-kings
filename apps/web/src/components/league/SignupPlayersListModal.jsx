import { X } from 'lucide-react';

// Helper function to format datetime with timezone
function formatDateTimeWithTimezone(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  const dateStr = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone 
  });
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  
  return `${dateStr} at ${timeStr} ${timeZoneName}`;
}

export default function SignupPlayersListModal({ signup, onClose }) {
  if (!signup || !signup.players) {
    return null;
  }
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Players Signed Up</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="signup-players-modal-list">
            {signup.players.length === 0 ? (
              <p>No players signed up yet.</p>
            ) : (
              signup.players
                .sort((a, b) => {
                  // Sort by signed_up_at timestamp to determine order
                  const timeA = a.signed_up_at ? new Date(a.signed_up_at).getTime() : 0;
                  const timeB = b.signed_up_at ? new Date(b.signed_up_at).getTime() : 0;
                  return timeA - timeB;
                })
                .map((player, idx) => {
                  const signupOrder = idx + 1; // Calculate order based on sorted position
                  return (
                    <div key={idx} className="signup-player-modal-item">
                      <span className="player-modal-order">{signupOrder}.</span>
                      <div className="player-modal-name">{player.player_name}</div>
                      <div className="player-modal-time">
                        Signed up {formatDateTimeWithTimezone(player.signed_up_at)}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="league-text-button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
