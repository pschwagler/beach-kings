import { useState, useEffect, useMemo } from 'react';
import { Calendar, Trophy, Settings, Edit2, Check, X, Menu, X as XIcon } from 'lucide-react';
import NavBar from '../layout/NavBar';
import LeagueRankingsTab from './LeagueRankingsTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueDetailsTab from './LeagueDetailsTab';
import LeagueSignUpsTab from './LeagueSignUpsTab';
import { LeagueProvider, useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { getUserLeagues, updateLeague } from '../../services/api';
import { navigateTo } from '../../Router';

function LeagueDashboardContent({ leagueId }) {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();
  const { league, members, loading, error, updateLeague: updateLeagueInContext } = useLeague();
  const [activeTab, setActiveTab] = useState('rankings');
  const [message, setMessage] = useState(null);
  const [userLeagues, setUserLeagues] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Start collapsed on mobile screens
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });
  
  // League name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [leagueName, setLeagueName] = useState('');

  // Get isLeagueAdmin from context
  const { isLeagueAdmin } = useLeague();

  // Get tab from URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab && ['rankings', 'matches', 'details', 'signups'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

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

  // Handle window resize to auto-collapse on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleBack = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url);
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleUpdateLeagueName = async () => {
    if (!leagueName.trim()) {
      showMessage('error', 'League name is required');
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
      showMessage('error', err.response?.data?.detail || 'Failed to update league name');
      setLeagueName(league?.name || '');
      setIsEditingName(false);
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      window.history.pushState({}, '', `/league/${leagueId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handlePlayerClick = (playerName) => {
    // Navigate to player details - could be implemented later
    console.log('Player clicked:', playerName);
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Navigate to landing page after sign out
      navigateTo('/');
    }
  };

  const handleSignIn = () => {
    // Redirect to main page for sign in
    navigateTo('/');
  };

  const handleSignUp = () => {
    // Redirect to main page for sign up
    navigateTo('/');
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
          <div className="league-loading">
            Loading league...
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
          {/* Left Sidebar Navigation */}
          <aside className={`league-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="league-sidebar-header">
              <button
                className="league-sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <Menu size={20} /> : <XIcon size={20} />}
              </button>
            </div>
            
            <nav className="league-sidebar-nav">
              <button
                className={`league-sidebar-nav-item ${activeTab === 'rankings' ? 'active' : ''}`}
                onClick={() => handleTabChange('rankings')}
                title="Leaderboard"
              >
                <Trophy size={20} />
                <span>Leaderboard</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'matches' ? 'active' : ''}`}
                onClick={() => handleTabChange('matches')}
                title="Matches"
              >
                <Calendar size={20} />
                <span>Matches</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'signups' ? 'active' : ''}`}
                onClick={() => handleTabChange('signups')}
                title="Schedule & Sign Ups"
              >
                <Calendar size={20} />
                <span>Sign Ups</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'details' ? 'active' : ''}`}
                onClick={() => handleTabChange('details')}
                title="Details"
              >
                <Settings size={20} />
                <span>Details</span>
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="league-content">
            {/* League Name Header */}
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

            {/* Message Alert */}
            {message && (
              <div className={`league-message ${message.type}`}>
                {message.text}
              </div>
            )}

            {/* Tab Content */}
            {activeTab === 'rankings' && <LeagueRankingsTab />}

            {activeTab === 'matches' && (
              <LeagueMatchesTab
                leagueId={leagueId}
                onPlayerClick={handlePlayerClick}
                showMessage={showMessage}
              />
            )}

            {activeTab === 'details' && (
              <LeagueDetailsTab
                leagueId={leagueId}
                showMessage={showMessage}
              />
            )}

            {activeTab === 'signups' && (
              <LeagueSignUpsTab
                leagueId={leagueId}
                showMessage={showMessage}
              />
            )}

          </main>
        </div>
      </div>
    </>
  );
}

export default function LeagueDashboard({ leagueId }) {
  return (
    <LeagueProvider leagueId={leagueId}>
      <LeagueDashboardContent leagueId={leagueId} />
    </LeagueProvider>
  );
}
