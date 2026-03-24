import React, { useState } from 'react';
import { Trophy, Users, ChevronRight, AlertCircle, CheckCircle, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { leaveLeague, createLeague, addLeagueHomeCourt } from '../../services/api';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import ConfirmationModal from '../modal/ConfirmationModal';
import type { League } from '../../types';

const getErrorMessage = (error: unknown): string => {
  const e = error as { response?: { data?: { detail?: string } }; message?: string };
  return e.response?.data?.detail || e.message || 'Something went wrong';
};

interface LeaguesTabProps {
  userLeagues: League[];
  onLeagueClick: (action: string, id: number) => void;
  onLeaguesUpdate: () => Promise<void>;
}

export default function LeaguesTab({ userLeagues, onLeagueClick, onLeaguesUpdate }: LeaguesTabProps) {
  const { openModal } = useModal();
  const router = useRouter();
  const [showLeaveLeagueModal, setShowLeaveLeagueModal] = useState(false);
  const [leagueToLeave, setLeagueToLeave] = useState<{ id: number; name: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleLeaveLeague = (e: React.MouseEvent, leagueId: number, leagueName: string) => {
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

  const handleLeagueCardClick = (leagueId: number) => {
    if (onLeagueClick) {
      onLeagueClick('view-league', leagueId);
    }
  };

  const handleCreateLeague = async (leagueData: Record<string, unknown>) => {
    try {
      const { initial_court_id, ...payload } = leagueData;
      const newLeague = await createLeague(payload);

      // Add initial home court if selected
      if (initial_court_id && newLeague?.id) {
        try {
          await addLeagueHomeCourt(newLeague.id, initial_court_id as number);
        } catch {
          // Non-critical — league was created successfully
        }
      }

      // Refresh leagues list
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
      // Navigate to the newly created league details page
      router.push(`/league/${newLeague.id}?tab=details`);
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleCreateLeagueClick = () => {
    openModal(MODAL_TYPES.CREATE_LEAGUE, {
      onSubmit: handleCreateLeague
    });
  };

  const handleFindLeaguesClick = () => {
    router.push('/find-leagues');
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
        
        <div className="leagues-tab-create-btn-container">
          <button
            onClick={handleFindLeaguesClick}
            className="dashboard-widget-create-btn"
          >
            <Search size={16} />
            <span>Find Leagues</span>
          </button>
          <button
            onClick={handleCreateLeagueClick}
            className="leagues-tab-create-btn"
          >
            <Plus size={16} />
            <span>Create League</span>
          </button>
        </div>
        
        {userLeagues.length === 0 ? (
          <div className="coming-soon-section">
            <Trophy size={48} className="coming-soon-icon" />
            <h3>No leagues found</h3>
            <p>You haven&apos;t joined any leagues yet.</p>
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
