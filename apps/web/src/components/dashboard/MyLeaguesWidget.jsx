'use client';

import { Trophy, ChevronRight, Users, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { createLeague } from '../../services/api';

export default function MyLeaguesWidget({ leagues, onLeagueClick, onLeaguesUpdate, onViewAll }) {
  const router = useRouter();
  const { openModal } = useModal();

  const handleLeagueClick = (leagueId) => {
    if (onLeagueClick) {
      onLeagueClick(leagueId);
    } else {
      router.push(`/league/${leagueId}`);
    }
  };

  const handleCreateLeague = async (leagueData) => {
    try {
      const newLeague = await createLeague(leagueData);
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

  if (!leagues || leagues.length === 0) {
    return (
      <div className="dashboard-widget">
        <div className="dashboard-widget-header">
          <div className="dashboard-widget-header-title">
            <Trophy size={20} />
            <h3
              className={`dashboard-widget-title${onViewAll ? ' dashboard-widget-title--clickable' : ''}`}
              onClick={onViewAll || undefined}
              role={onViewAll ? 'link' : undefined}
              tabIndex={onViewAll ? 0 : undefined}
              onKeyDown={onViewAll ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewAll(); } } : undefined}
            >
              My Leagues
            </h3>
          </div>
          <div className="dashboard-widget-header-actions">
            <button
              onClick={handleFindLeaguesClick}
              className="dashboard-widget-create-btn"
            >
              <Search size={16} />
              <span>Find Leagues</span>
            </button>
            <button
              onClick={handleCreateLeagueClick}
              className="dashboard-widget-create-btn"
            >
              <Plus size={16} />
              <span>Create League</span>
            </button>
          </div>
        </div>
        <div className="dashboard-widget-content">
          <div className="dashboard-empty-state">
            <Trophy size={40} className="empty-state-icon" />
            <p>No leagues found</p>
            <p className="empty-state-text">
              Join or create a league to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-widget">
      <div className="dashboard-widget-header">
        <div className="dashboard-widget-header-title">
          <Trophy size={20} />
          <h3
              className={`dashboard-widget-title${onViewAll ? ' dashboard-widget-title--clickable' : ''}`}
              onClick={onViewAll || undefined}
              role={onViewAll ? 'link' : undefined}
              tabIndex={onViewAll ? 0 : undefined}
              onKeyDown={onViewAll ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewAll(); } } : undefined}
            >
              My Leagues
            </h3>
        </div>
        <div className="dashboard-widget-header-actions">
          <button
            onClick={handleFindLeaguesClick}
            className="dashboard-widget-create-btn"
          >
            <Search size={16} />
            <span>Find Leagues</span>
          </button>
          <button
            onClick={handleCreateLeagueClick}
            className="dashboard-widget-create-btn"
          >
            <Plus size={16} />
            <span>Create League</span>
          </button>
        </div>
      </div>
      <div className="dashboard-widget-content">
        <div className="dashboard-leagues-list">
          {leagues.slice(0, 5).map((league) => (
            <div
              key={league.id}
              className="dashboard-league-item"
              onClick={() => handleLeagueClick(league.id)}
            >
              <div className="dashboard-league-info">
                <h4 className="dashboard-league-name">{league.name}</h4>
                <div className="dashboard-league-meta">
                  {league.location_name && (
                    <span className="dashboard-league-location">
                      {league.location_name}
                    </span>
                  )}
                  <span className="dashboard-league-members">
                    <Users size={14} />
                    {league.member_count || 0}
                  </span>
                </div>
              </div>
              <ChevronRight size={20} className="dashboard-chevron" />
            </div>
          ))}
          {leagues.length > 5 && (
            <div className="dashboard-widget-footer">
              <p className="secondary-text">
                +{leagues.length - 5} more league{leagues.length - 5 !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
