import { useState } from 'react';
import { Trophy, Users, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import { leaveLeague } from '../../services/api';
import ConfirmationModal from '../modal/ConfirmationModal';

const getErrorMessage = (error) => error.response?.data?.detail || error.message || 'Something went wrong';

export default function LeaguesTab({ userLeagues, onLeagueClick, onLeaguesUpdate }) {
  const [showLeaveLeagueModal, setShowLeaveLeagueModal] = useState(false);
  const [leagueToLeave, setLeagueToLeave] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleLeaveLeague = (e, leagueId, leagueName) => {
    e.stopPropagation();
    setLeagueToLeave({ id: leagueId, name: leagueName });
    setShowLeaveLeagueModal(true);
  };

  const confirmLeaveLeague = async () => {
    if (!leagueToLeave) return;
    
    try {
      await leaveLeague(leagueToLeave.id);
      setSuccessMessage(`Successfully left ${leagueToLeave.name}`);
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
      // Refresh leagues list
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
    } catch (error) {
      console.error('Error leaving league:', error);
      setErrorMessage(getErrorMessage(error));
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
    }
  };

  const handleLeagueCardClick = (leagueId) => {
    if (onLeagueClick) {
      onLeagueClick('view-league', leagueId);
    }
  };

  return (
    <>
      <div className="profile-page__section league-section">
        {errorMessage && (
          <div className="auth-modal__alert error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="auth-modal__alert success">
            <CheckCircle size={18} />
            <span>{successMessage}</span>
          </div>
        )}
        
        {userLeagues.length === 0 ? (
          <div className="coming-soon-section">
            <Trophy size={48} className="coming-soon-icon" />
            <h3>No leagues found</h3>
            <p>You haven't joined any leagues yet.</p>
          </div>
        ) : (
          <div className="leagues-list">
            {userLeagues.map(league => (
              <div 
                key={league.id} 
                className="league-card" 
                onClick={() => handleLeagueCardClick(league.id)}
              >
                <div className="league-card-content">
                  <h3 className="league-card-title">{league.name}</h3>
                  <div className="league-card-meta">
                    <span className="league-card-badge">
                      {league.location_name || 'No location'}
                    </span>
                    <span className="league-card-members">
                      <Users size={14} />
                      {league.member_count || 0} members
                    </span>
                  </div>
                </div>
                
                <div className="league-card-actions">
                  <button
                    onClick={(e) => handleLeaveLeague(e, league.id, league.name)}
                    className="league-leave-button"
                  >
                    Leave
                  </button>
                  
                  <ChevronRight size={20} className="league-card-chevron" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showLeaveLeagueModal}
        onClose={() => {
          setShowLeaveLeagueModal(false);
          setLeagueToLeave(null);
        }}
        onConfirm={confirmLeaveLeague}
        title="Leave League"
        message={leagueToLeave ? `Are you sure you want to leave ${leagueToLeave.name}?` : ''}
        confirmText="Leave League"
        cancelText="Cancel"
      />
    </>
  );
}
