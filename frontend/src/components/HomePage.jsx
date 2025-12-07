import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../contexts/ModalContext';
import { getUserLeagues, leaveLeague, createLeague } from '../services/api';
import { navigateTo } from '../Router';
import { Home, User, Users, Trophy, PanelRightClose, PanelRightOpen } from 'lucide-react';
import NavBar from './layout/NavBar';
import HomeTab from './home/HomeTab';
import ProfileTab from './home/ProfileTab';
import LeaguesTab from './home/LeaguesTab';
import FriendsTab from './home/FriendsTab';

export default function HomePage() {
  const { user, currentUserPlayer, isAuthenticated, fetchCurrentUser, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  
  // Get active tab from URL query params
  const getTabFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'home';
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });
  const [userLeagues, setUserLeagues] = useState([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigateTo('/');
    }
  }, [isAuthenticated]);

  // Check if profile is incomplete and open modal if needed
  // This runs every time the user visits the home page or when currentUserPlayer changes
  useEffect(() => {
    if (isAuthenticated) {
      // If currentUserPlayer hasn't loaded yet, fetch it first
      if (currentUserPlayer === undefined) {
        fetchCurrentUser();
        return; // Will re-run when currentUserPlayer updates
      }
      
      // Check if profile is incomplete (missing gender or level)
      const profileIncomplete = !currentUserPlayer?.gender || !currentUserPlayer?.level;
      
      if (profileIncomplete) {
        // Small delay to ensure page is rendered and avoid conflicts with other modals
        const timeoutId = setTimeout(() => {
          openModal(MODAL_TYPES.PLAYER_PROFILE, {
            onSuccess: async () => {
              await fetchCurrentUser();
            }
          });
        }, 500);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [isAuthenticated, currentUserPlayer, openModal, fetchCurrentUser]);

  // Update tab when URL changes
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load user leagues
  useEffect(() => {
    const loadUserLeagues = async () => {
      if (isAuthenticated) {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (err) {
          console.error('Error loading user leagues:', err);
        }
      }
    };
    loadUserLeagues();
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      navigateTo('/');
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Update URL without page reload
    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url);
    
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Collapse sidebar on mobile after tab change
    if (window.innerWidth <= 768) {
      setSidebarCollapsed(true);
    }
  };

  const handleCreateLeague = async (leagueData) => {
    try {
      const newLeague = await createLeague(leagueData);
      const leagues = await getUserLeagues();
      setUserLeagues(leagues);
      window.history.pushState({}, '', `/league/${newLeague.id}?tab=details`);
      window.dispatchEvent(new PopStateEvent('popstate'));
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
      window.history.pushState({}, '', `/league/${leagueId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  if (!isAuthenticated) {
    return null;
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
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          {/* Left Sidebar Navigation */}
          <aside className={`sidebar sidebar--home ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="league-sidebar-header">
              <div className="league-sidebar-title-wrapper-container">
                <div className="league-sidebar-title-wrapper no-pointer">
                  <h1 className="league-sidebar-title">Dashboard</h1>
                </div>
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
                className={`league-sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => handleTabChange('home')}
                title="Home"
              >
                <Home size={20} />
                <span>Home</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => handleTabChange('profile')}
                title="Profile"
              >
                <User size={20} />
                <span>Profile</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'leagues' ? 'active' : ''}`}
                onClick={() => handleTabChange('leagues')}
                title="My Leagues"
              >
                <Trophy size={20} />
                <span>My Leagues</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => handleTabChange('friends')}
                title="Friends"
              >
                <Users size={20} />
                <span>Friends</span>
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="home-content">
            <div className="profile-page-content">
              {activeTab === 'home' && (
                <HomeTab 
                  currentUserPlayer={currentUserPlayer}
                  userLeagues={userLeagues}
                  onTabChange={handleTabChange}
                  onLeaguesUpdate={async () => {
                    const leagues = await getUserLeagues();
                    setUserLeagues(leagues);
                  }}
                />
              )}
              
              {activeTab === 'profile' && (
                <ProfileTab 
                  user={user}
                  currentUserPlayer={currentUserPlayer}
                  fetchCurrentUser={fetchCurrentUser}
                />
              )}
              
              {activeTab === 'leagues' && (
                <LeaguesTab 
                  userLeagues={userLeagues}
                  onLeagueClick={handleLeaguesMenuClick}
                  onLeaguesUpdate={async () => {
                    const leagues = await getUserLeagues();
                    setUserLeagues(leagues);
                  }}
                />
              )}
              
              {activeTab === 'friends' && (
                <FriendsTab />
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

