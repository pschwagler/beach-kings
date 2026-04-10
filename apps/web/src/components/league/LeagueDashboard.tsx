'use client';

import { useState, useEffect } from 'react';
import { Calendar, Settings, Edit2, Check, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavBar from '../layout/NavBar';
import LeagueRankingsTab from './LeagueRankingsTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueDetailsTab from './LeagueDetailsTab';
import LeagueSignUpsTab from './LeagueSignUpsTab';
import LeagueMessagesTab from './LeagueMessagesTab';
import LeagueAwardsTab from './LeagueAwardsTab';
import LeagueMenuBar from './LeagueMenuBar';
import PublicLeaguePage, { type PublicLeagueData } from './PublicLeaguePage';
import { LeagueProvider, useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { updateLeague, createLeague, addLeagueHomeCourt, joinLeague, requestToJoinLeague } from '../../services/api';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { RankingsTableSkeleton, MatchesTableSkeleton, SignupListSkeleton, LeagueDetailsSkeleton } from '../ui/Skeletons';
import './LeagueDashboard.css';

interface LeagueDashboardContentProps {
  leagueId: number;
  initialTab?: string;
  publicLeagueData?: PublicLeagueData | null;
}

function LeagueDashboardContent({ leagueId, initialTab, publicLeagueData }: LeagueDashboardContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { league, members, loading, error, updateLeague: updateLeagueInContext, refreshLeague, setActiveLeagueTab, activeLeagueTab, isLeagueAdmin, isLeagueMember } = useLeague();
  const { showToast } = useToast();
  const { userLeagues, refreshLeagues } = useApp();

  // Sync initialTab to context post-mount (deferred to avoid side-effects during render)
  useEffect(() => {
    if (initialTab) {
      setActiveLeagueTab(initialTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // League name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [leagueName, setLeagueName] = useState('');

  // Client-side fallback for publicLeagueData (in case SSR fetch failed)
  const [clientPublicData, setClientPublicData] = useState<PublicLeagueData | null | undefined>(publicLeagueData);
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

  const handleBack = () => {
    router.push('/');
  };

  const handleTabChange = (tab: string) => {
    setActiveLeagueTab(tab);
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
      });

      updateLeagueInContext(updatedLeague);
      setIsEditingName(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to update league name', 'error');
      setLeagueName(league?.name || '');
      setIsEditingName(false);
    }
  };

  const handleCreateLeague = async (leagueData: Record<string, unknown>) => {
    try {
      const { initial_court_id, ...payload } = leagueData;
      const newLeague = await createLeague(payload);
      if (initial_court_id && newLeague?.id) {
        try { await addLeagueHomeCourt(newLeague.id as number, initial_court_id as number); } catch {}
      }
      await refreshLeagues();
      router.push(`/league/${newLeague.id}?tab=details`);
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
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
      if (league?.is_open) {
        await joinLeague(leagueId);
        showToast(`Successfully joined ${league?.name}!`, 'success');
        await refreshLeague();
        await refreshLeagues();
      } else {
        await requestToJoinLeague(leagueId);
        showToast(`Join request submitted for ${league?.name}. League admins will be notified.`, 'success');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      const errorMsg = e.response?.data?.detail || 'Failed to join league';
      showToast(errorMsg, 'error');
    }
  };

  // Render appropriate skeleton based on active tab
  const renderTabSkeleton = () => {
    switch (activeLeagueTab) {
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
              activeTab={activeLeagueTab}
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
              activeTab={activeLeagueTab}
              onTabChange={handleTabChange}
              userLeagues={userLeagues}
              isAuthenticated={isAuthenticated}
            />
            <main className="league-content">
              <PublicLeaguePage
                league={clientPublicData as unknown as PublicLeagueData}
                leagueId={leagueId}
                onJoinLeague={handleJoinLeague}
                isOpen={league?.is_open ?? false}
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
            activeTab={activeLeagueTab}
            onTabChange={handleTabChange}
            userLeagues={userLeagues}
            isAuthenticated={isAuthenticated}
          />

          {/* Main Content Area */}
          <main className="league-content">
            {/* League Name Header - Only show on Details tab */}
            {activeLeagueTab === 'details' && (
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
                        onClick={() => { setLeagueName(league?.name || ''); setIsEditingName(true); }}
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
            {activeLeagueTab === 'rankings' && <LeagueRankingsTab />}

            {activeLeagueTab === 'matches' && (
              <LeagueMatchesTab
                seasonIdFromUrl={seasonIdParam ? parseInt(seasonIdParam, 10) : null}
                autoOpenAddMatch={autoAddMatch}
              />
            )}

            {activeLeagueTab === 'awards' && (
              <LeagueAwardsTab leagueId={leagueId} />
            )}

            {activeLeagueTab === 'details' && (
              <LeagueDetailsTab />
            )}

            {activeLeagueTab === 'signups' && (
              <LeagueSignUpsTab />
            )}

            {activeLeagueTab === 'messages' && (
              <LeagueMessagesTab leagueId={leagueId} />
            )}

          </main>
        </div>
      </div>
    </>
  );
}

interface LeagueDashboardProps {
  leagueId: number;
  initialTab?: string;
  publicLeagueData?: PublicLeagueData | null;
}

export default function LeagueDashboard({ leagueId, initialTab, publicLeagueData }: LeagueDashboardProps) {
  // leagueId is passed from the Next.js page component
  return (
    <LeagueDashboardContent leagueId={leagueId} initialTab={initialTab} publicLeagueData={publicLeagueData} />
  );
}
