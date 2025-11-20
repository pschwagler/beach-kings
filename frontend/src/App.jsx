import { useState, useEffect } from 'react';
import { Crown } from 'lucide-react';
import './App.css';
import NavBar from './components/layout/NavBar';
import HeroHeader from './components/layout/HeroHeader';
import AuthModal from './components/auth/AuthModal';
import CreateLeagueModal from './components/league/CreateLeagueModal';
import PlayerProfileModal from './components/player/PlayerProfileModal';
import { useAuth } from './contexts/AuthContext';
import { createLeague, getUserLeagues } from './services/api';
import { navigateTo } from './Router';

function App() {
  const { isAuthenticated, user, logout, currentUserPlayer } = useAuth();
  const [authModalMode, setAuthModalMode] = useState('sign-in');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isPlayerProfileModalOpen, setIsPlayerProfileModalOpen] = useState(false);
  const [userLeagues, setUserLeagues] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthModalOpen(false);
      navigateTo('/');
    }
  };

  const openAuthModal = (mode) => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  // Check if user needs to complete profile after signup
  useEffect(() => {
    if (isAuthenticated && justSignedUp && currentUserPlayer) {
      if (!currentUserPlayer.full_name || currentUserPlayer.full_name.trim() === '' || currentUserPlayer.full_name === ' ') {
        setIsAuthModalOpen(false);
        setTimeout(() => {
          setIsPlayerProfileModalOpen(true);
        }, 200);
      } else {
        setIsAuthModalOpen(false);
      }
      setJustSignedUp(false);
    }
  }, [isAuthenticated, justSignedUp, currentUserPlayer]);

  // Clear pending action if user closes modal without logging in
  useEffect(() => {
    if (!isAuthModalOpen && !isAuthenticated && pendingAction) {
      setPendingAction(null);
    }
  }, [isAuthModalOpen, isAuthenticated, pendingAction]);

  // Execute pending action after successful authentication
  useEffect(() => {
    if (isAuthenticated && pendingAction) {
      if (isAuthModalOpen) {
        setIsAuthModalOpen(false);
      }
      
      const timeoutId = setTimeout(() => {
        if (pendingAction.type === 'create-league') {
          setIsCreateLeagueModalOpen(true);
        } else if (pendingAction.type === 'view-league' && pendingAction.leagueId) {
          navigateToLeague(pendingAction.leagueId);
        }
        setPendingAction(null);
      }, 200);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, pendingAction, isAuthModalOpen]);

  // Load leagues when user authenticates
  useEffect(() => {
    const loadUserLeagues = async () => {
      try {
        const leagues = await getUserLeagues();
        setUserLeagues(leagues);
      } catch (error) {
        console.error('Error loading user leagues:', error);
        setUserLeagues([]);
      }
    };

    if (isAuthenticated) {
      loadUserLeagues();
    } else {
      setUserLeagues([]);
    }
  }, [isAuthenticated]);

  const navigateToLeague = (leagueId) => {
    window.history.pushState({}, '', `/league/${leagueId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
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
      if (!isAuthenticated) {
        setPendingAction({ type: 'create-league' });
        openAuthModal('sign-in');
        return;
      }
      setIsCreateLeagueModalOpen(true);
    } else if (action === 'view-league' && leagueId) {
      if (!isAuthenticated) {
        setPendingAction({ type: 'view-league', leagueId });
        openAuthModal('sign-in');
        return;
      }
      navigateToLeague(leagueId);
    } else if (leagueId) {
      if (!isAuthenticated) {
        setPendingAction({ type: 'view-league', leagueId });
        openAuthModal('sign-in');
        return;
      }
      navigateToLeague(leagueId);
    }
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <div className="container">
        <HeroHeader />
        <div className="landing-content">
          {!isAuthenticated ? (
            <div className="landing-message">
              <h2 className="landing-welcome-title">
                Welcome to{' '}
                <span className="landing-brand">
                  <Crown size={28} className="landing-brand-crown" />
                  <span className="landing-brand-text">BEACH LEAGUE</span>
                </span>
                {' '}Beach Volleyball App
              </h2>
              <p>Login to get started</p>
              <button 
                className="btn btn-primary" 
                onClick={() => openAuthModal('sign-in')}
              >
                Sign In
              </button>
            </div>
          ) : (
            <div className="landing-message">
              <h2 className="landing-welcome-title">
                Welcome back{currentUserPlayer?.first_name ? ', ' + currentUserPlayer.first_name : ''}!
              </h2>
              <p>Select a league from the menu above to get started.</p>
            </div>
          )}
        </div>
      </div>
      <AuthModal 
        isOpen={isAuthModalOpen} 
        mode={authModalMode} 
        onClose={closeAuthModal}
        onVerifySuccess={() => {
          setJustSignedUp(true);
        }}
      />
      <CreateLeagueModal
        isOpen={isCreateLeagueModalOpen}
        onClose={() => setIsCreateLeagueModalOpen(false)}
        onSubmit={handleCreateLeague}
      />
      <PlayerProfileModal
        isOpen={isPlayerProfileModalOpen}
        onClose={() => setIsPlayerProfileModalOpen(false)}
        onSuccess={() => {}}
      />
    </>
  );
}

export default App;
