'use client';

import { Trophy, Users, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { createLeague, addLeagueHomeCourt } from '../../services/api';

/**
 * Full-width horizontal leagues bar for the home tab.
 * Shows leagues as horizontally scrollable compact cards.
 */
export default function MyLeaguesBar({ leagues, onLeagueClick, onLeaguesUpdate, onViewAll }) {
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
      const { initial_court_id, ...payload } = leagueData;
      const newLeague = await createLeague(payload);
      if (initial_court_id && newLeague?.id) {
        try { await addLeagueHomeCourt(newLeague.id, initial_court_id); } catch {}
      }
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
      router.push(`/league/${newLeague.id}?tab=details`);
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleCreateLeagueClick = () => {
    openModal(MODAL_TYPES.CREATE_LEAGUE, {
      onSubmit: handleCreateLeague,
    });
  };

  const handleFindLeaguesClick = () => {
    router.push('/find-leagues');
  };

  const titleElement = (
    <h3
      className={`home-leagues-bar__title${onViewAll ? ' dashboard-widget-title--clickable' : ''}`}
      onClick={onViewAll || undefined}
      role={onViewAll ? 'button' : undefined}
      tabIndex={onViewAll ? 0 : undefined}
      onKeyDown={onViewAll ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewAll(); } } : undefined}
    >
      My Leagues
    </h3>
  );

  return (
    <div className="home-leagues-bar">
      <div className="home-leagues-bar__header">
        <div className="home-leagues-bar__header-title">
          <Trophy size={20} />
          {titleElement}
        </div>
        <div className="home-leagues-bar__actions">
          <button onClick={handleFindLeaguesClick} className="dashboard-widget-create-btn">
            <Search size={16} />
            <span>Find Leagues</span>
          </button>
          <button onClick={handleCreateLeagueClick} className="dashboard-widget-create-btn">
            <Plus size={16} />
            <span>Create League</span>
          </button>
        </div>
      </div>
      {(!leagues || leagues.length === 0) ? (
        <div className="home-leagues-bar__empty">
          <p>Join or create a league to get started</p>
        </div>
      ) : (
        <div className="home-leagues-bar__scroll-track">
          {leagues.map((league) => (
            <div
              key={league.id}
              className="home-leagues-bar__card"
              onClick={() => handleLeagueClick(league.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLeagueClick(league.id); } }}
            >
              <div className="home-leagues-bar__card-name">{league.name}</div>
              <div className="home-leagues-bar__card-meta">
                {league.location_name && (
                  <span className="home-leagues-bar__card-location">{league.location_name}</span>
                )}
                <span className="home-leagues-bar__card-members">
                  <Users size={12} />
                  {league.member_count || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
