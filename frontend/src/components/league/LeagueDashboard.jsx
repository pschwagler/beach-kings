import { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Trophy, Settings, Edit2, Check, X, Menu, X as XIcon, PanelRightClose, PanelRightOpen, ChevronDown, Users, Swords, MessageSquare } from 'lucide-react';
import NavBar from '../layout/NavBar';
import LeagueRankingsTab from './LeagueRankingsTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueDetailsTab from './LeagueDetailsTab';
import LeagueSignUpsTab from './LeagueSignUpsTab';
import LeagueMessagesTab from './LeagueMessagesTab';
import { LeagueProvider, useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { getUserLeagues, updateLeague } from '../../services/api';
import { navigateTo } from '../../Router';
import NavDropdown from '../layout/navbar/NavDropdown';
import NavDropdownSection from '../layout/navbar/NavDropdownSection';
import NavDropdownItem from '../layout/navbar/NavDropdownItem';
import { RankingsTableSkeleton, MatchesTableSkeleton, SignupListSkeleton, LeagueDetailsSkeleton, LeagueSidebarTitleSkeleton } from '../ui/Skeletons';

function LeagueDashboardContent({ leagueId }) {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { league, members, loading, error, updateLeague: updateLeagueInContext } = useLeague();
  // Initialize activeTab from URL params immediately
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get('tab');
      if (tab && ['rankings', 'matches', 'details', 'signups', 'messages'].includes(tab)) {
        return tab;
      }
    }
    return 'rankings';
  });
  const { message, showMessage } = useLeague();
  const [userLeagues, setUserLeagues] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Start collapsed on mobile screens
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const leagueDropdownRef = useRef(null);
  
  // League name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [leagueName, setLeagueName] = useState('');

  // Get isLeagueAdmin and isLeagueMember from context
  const { isLeagueAdmin, isLeagueMember } = useLeague();

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

  // Close league dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(event.target)) {
        setIsLeagueDropdownOpen(false);
      }
    };

    if (isLeagueDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLeagueDropdownOpen]);

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
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const handleLeagueSelect = (selectedLeagueId) => {
    if (selectedLeagueId !== leagueId) {
      window.history.pushState({}, '', `/league/${selectedLeagueId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setIsLeagueDropdownOpen(false);
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
    openAuthModal('sign-in');
  };

  const handleSignUp = () => {
    openAuthModal('sign-up');
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
            {/* Left Sidebar Navigation */}
            <aside className={`league-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
              <div className="league-sidebar-header">
                <LeagueSidebarTitleSkeleton />
                <button
                  className="league-sidebar-collapse-btn"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
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
                  title="Games"
                >
                  <Swords size={20} />
                  <span>Games</span>
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
                  className={`league-sidebar-nav-item ${activeTab === 'messages' ? 'active' : ''}`}
                  onClick={() => handleTabChange('messages')}
                  title="Messages"
                >
                  <MessageSquare size={20} />
                  <span>Messages</span>
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

  // Check if user is a league member (only check if authenticated and members are loaded)
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
          <div className="league-error">
            <div className="league-message error">
              <h2>Access Denied</h2>
              <p>You don't have access to this league. Please contact a league administrator to be added as a member.</p>
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
              <div className="league-sidebar-title-wrapper-container" ref={leagueDropdownRef}>
                <button
                  className="league-sidebar-title-wrapper"
                  onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                  aria-label="Select league"
                >
                  <h1 className="league-sidebar-title">{league.name}</h1>
                  <ChevronDown 
                    size={16} 
                    className={`league-sidebar-title-caret ${isLeagueDropdownOpen ? 'open' : ''}`}
                  />
                </button>
                {isLeagueDropdownOpen && isAuthenticated && userLeagues.length > 0 && (
                  <div className="league-sidebar-dropdown">
                    <NavDropdown className="league-sidebar-dropdown-menu">
                      <NavDropdownSection title="My Leagues">
                        {userLeagues.map((userLeague) => (
                          <NavDropdownItem
                            key={userLeague.id}
                            icon={Users}
                            variant={userLeague.id === leagueId ? 'league' : 'default'}
                            onClick={() => handleLeagueSelect(userLeague.id)}
                            className={userLeague.id === leagueId ? 'league-sidebar-current' : ''}
                          >
                            {userLeague.name}
                          </NavDropdownItem>
                        ))}
                      </NavDropdownSection>
                    </NavDropdown>
                  </div>
                )}
              </div>
              <button
                className="league-sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
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
                title="Games"
              >
                <Swords size={20} />
                <span>Games</span>
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
                className={`league-sidebar-nav-item ${activeTab === 'messages' ? 'active' : ''}`}
                onClick={() => handleTabChange('messages')}
                title="Messages"
              >
                <MessageSquare size={20} />
                <span>Messages</span>
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

            {/* Message Alert */}
            {message && (
              <div className={`league-message ${message.type}`}>
                {message.text}
              </div>
            )}

            {/* Tab Content */}
            {activeTab === 'rankings' && <LeagueRankingsTab />}

            {activeTab === 'matches' && (
              <LeagueMatchesTab />
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

export default function LeagueDashboard({ leagueId }) {
  return (
    <LeagueProvider leagueId={leagueId}>
      <LeagueDashboardContent leagueId={leagueId} />
    </LeagueProvider>
  );
}
