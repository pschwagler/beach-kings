'use client';

import { useState, useEffect, useMemo } from 'react';
import { Calendar, Settings, Edit2, Check, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavBar from '../layout/NavBar';
import LeagueRankingsTab from './LeagueRankingsTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueDetailsTab from './LeagueDetailsTab';
import LeagueSignUpsTab from './LeagueSignUpsTab';
import LeagueMessagesTab from './LeagueMessagesTab';
import LeagueMenuBar from './LeagueMenuBar';
import PublicLeaguePage from './PublicLeaguePage';
import { LeagueProvider, useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { getUserLeagues, updateLeague, createLeague, joinLeague, requestToJoinLeague } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { RankingsTableSkeleton, MatchesTableSkeleton, SignupListSkeleton, LeagueDetailsSkeleton } from '../ui/Skeletons';
import './LeagueDashboard.css';

function LeagueDashboardContent({ leagueId, publicLeagueData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { league, members, loading, error, updateLeague: updateLeagueInContext } = useLeague();
  const { showToast } = useToast();
  // Initialize activeTab from URL params immediately
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams?.get('tab');
    if (tab && ['rankings', 'matches', 'details', 'signups', 'messages'].includes(tab)) {
      return tab;
    }
    return 'rankings';
  });
  const [userLeagues, setUserLeagues] = useState([]);
  
  // League name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [leagueName, setLeagueName] = useState('');

  // Get isLeagueAdmin and isLeagueMember from context
  const { isLeagueAdmin, isLeagueMember } = useLeague();

  // Client-side fallback for publicLeagueData (in case SSR fetch failed)
  const [clientPublicData, setClientPublicData] = useState(publicLeagueData);
  useEffect(() => {
    if (publicLeagueData) {
      setClientPublicData(publicLeagueData);
      return;
    }
    let cancelled = false;
    fetch(`/api/public/leagues/${leagueId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setClientPublicData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leagueId, publicLeagueData]);

  // Get URL query parameters for navigation
  const seasonIdParam = searchParams?.get('season');
  const autoAddMatch = searchParams?.get('autoAddMatch') === 'true';

  // Get tab from URL query parameter
  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (tab && ['rankings', 'matches', 'details', 'signups', 'messages'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load user leagues for the navbar
  useEffect(() => {
    if (isAuthenticated) {
      const loadLeagues = async () => {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error('Error loading user leagues:', err);
        }
      };
      loadLeagues();
    }
  }, [isAuthenticated]);

  // Update league name when league changes
  useEffect(() => {
    if (league) {
      setLeagueName(league.name || '');
    }
  }, [league]);


  const handleBack = () => {
    router.push('/');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Update URL with Next.js router
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    router.push(`/league/${leagueId}?${params.toString()}`);
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  const handleUpdateLeagueName = async () => {
    if (!leagueName.trim()) {
      showToast('League name is required', 'error');
      setLeagueName(league?.name || '');
      setIsEditingName(false);
      return;
    }

    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: leagueName.trim(),
        description: league?.description || null,
        level: league?.level || null,
        location_id: league?.location_id || null,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });
      
      updateLeagueInContext(updatedLeague);
      setIsEditingName(false);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update league name', 'error');
      setLeagueName(league?.name || '');
      setIsEditingName(false);
    }
  };

  const handleCreateLeague = async (leagueData) => {
    try {
      const newLeague = await createLeague(leagueData);
      const leagues = await getUserLeagues();
      setUserLeagues(leagues);
      router.push(`/league/${newLeague.id}?tab=details`);
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: handleCreateLeague
      });
    } else if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Navigate to landing page after sign out
      router.push('/');
    }
  };

  const handleSignIn = () => {
    openAuthModal('sign-in');
  };

  const handleSignUp = () => {
    openAuthModal('sign-up');
  };

  const handleJoinLeague = async () => {
    try {
      if (league.is_open) {
        await joinLeague(leagueId);
        showToast(`Successfully joined ${league.name}!`, 'success');
        // Reload the page to refresh league membership
        window.location.reload();
      } else {
        await requestToJoinLeague(leagueId);
        showToast(`Join request submitted for ${league.name}. League admins will be notified.`, 'success');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to join league';
      showToast(errorMsg, 'error');
    }
  };

  // Render appropriate skeleton based on active tab
  const renderTabSkeleton = () => {
    switch (activeTab) {
      case 'rankings':
        return <RankingsTableSkeleton />;
      case 'matches':
        // Always show Add Match card skeleton during loading to match final layout
        return <MatchesTableSkeleton isLeagueMember={true} />;
      case 'signups':
        return <SignupListSkeleton />;
      case 'details':
        return <LeagueDetailsSkeleton />;
      default:
        return <RankingsTableSkeleton />;
    }
  };

  if (loading) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
          onSignOut={handleSignOut}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
        <div className="league-dashboard-container">
          <div className="league-dashboard">
            <LeagueMenuBar
              leagueId={leagueId}
              leagueName={league?.name || ''}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              userLeagues={userLeagues}
              isAuthenticated={isAuthenticated}
              loading
            />

            {/* Main Content Area */}
            <main className="league-content">
              {renderTabSkeleton()}
            </main>
          </div>
        </div>
      </>
    );
  }

  if (error || !league) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
          onSignOut={handleSignOut}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
        <div className="league-dashboard-container">
          <div className="league-error">
            <div className="league-message error">
              {error || 'League not found'}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Authenticated non-member: show public league info with join button
  if (isAuthenticated && members.length > 0 && !isLeagueMember) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
          onSignOut={handleSignOut}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
        <div className="league-dashboard-container">
          <div className="league-dashboard">
            <LeagueMenuBar
              leagueId={leagueId}
              leagueName={league.name}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              userLeagues={userLeagues}
              isAuthenticated={isAuthenticated}
            />
            <main className="league-content">
              <PublicLeaguePage
                league={clientPublicData}
                leagueId={leagueId}
                onJoinLeague={handleJoinLeague}
                isOpen={league.is_open}
              />
            </main>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          <LeagueMenuBar
            leagueId={leagueId}
            leagueName={league.name}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            userLeagues={userLeagues}
            isAuthenticated={isAuthenticated}
          />

          {/* Main Content Area */}
          <main className="league-content">
            {/* League Name Header - Only show on Details tab */}
            {activeTab === 'details' && (
              <div className="league-content-header">
                {isEditingName ? (
                  <div className="league-content-header-edit">
                    <input
                      type="text"
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUpdateLeagueName();
                        } else if (e.key === 'Escape') {
                          setLeagueName(league.name);
                          setIsEditingName(false);
                        }
                      }}
                      className="league-content-header-input"
                      autoFocus
                    />
                    <div className="league-content-header-actions">
                      <button
                        className="league-content-header-action-btn"
                        onClick={handleUpdateLeagueName}
                        aria-label="Save"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        className="league-content-header-action-btn"
                        onClick={() => {
                          setLeagueName(league.name);
                          setIsEditingName(false);
                        }}
                        aria-label="Cancel"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="league-content-header-title">
                    <h1 className="league-content-header-text">{league.name}</h1>
                    {isLeagueAdmin && (
                      <button
                        className="league-content-header-edit-btn"
                        onClick={() => setIsEditingName(true)}
                        aria-label="Edit league name"
                      >
                        <Edit2 size={18} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab Content */}
            {activeTab === 'rankings' && <LeagueRankingsTab />}

            {activeTab === 'matches' && (
              <LeagueMatchesTab
                seasonIdFromUrl={seasonIdParam ? parseInt(seasonIdParam, 10) : null}
                autoOpenAddMatch={autoAddMatch}
              />
            )}

            {activeTab === 'details' && (
              <LeagueDetailsTab />
            )}

            {activeTab === 'signups' && (
              <LeagueSignUpsTab />
            )}

            {activeTab === 'messages' && (
              <LeagueMessagesTab leagueId={leagueId} />
            )}

          </main>
        </div>
      </div>
    </>
  );
}

export default function LeagueDashboard({ leagueId, publicLeagueData }) {
  // leagueId is passed from the Next.js page component
  return (
    <LeagueDashboardContent leagueId={leagueId} publicLeagueData={publicLeagueData} />
  );
}
