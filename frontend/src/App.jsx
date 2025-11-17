import { useState, useEffect } from 'react';
import './App.css';
import NavBar from './components/layout/NavBar';
import HeroHeader from './components/layout/HeroHeader';
import ControlPanel from './components/control/ControlPanel';
import RankingsTable from './components/rankings/RankingsTable';
import MatchesTable from './components/match/MatchesTable';
import PlayerDetailsPanel from './components/player/PlayerDetailsPanel';
import AuthModal from './components/auth/AuthModal';
import CreateLeagueModal from './components/league/CreateLeagueModal';
import PlayerProfileModal from './components/player/PlayerProfileModal';
import { Alert, Tabs } from './components/ui/UI';
import { useData } from './contexts/DataContext';
import { usePlayerDetails } from './hooks/usePlayerDetails';
import { useAuth } from './contexts/AuthContext';
import { createLeague, listLeagues, getUserLeagues, getCurrentUserPlayer } from './services/api';

function App() {
  const { isAuthenticated, user, logout } = useAuth();
  const { 
    rankings, 
    matches, 
    activeSession,
    loading, 
    message, 
    setMessage, 
    handleLoadFromSheets,
    handleCreateSession,
    handleEndSession,
    handleDeleteSession,
    handleCreateMatch,
    handleUpdateMatch,
    handleDeleteMatch,
    handleCreatePlayer,
    allPlayerNames 
  } = useData();
  const [activeTab, setActiveTab] = useState('rankings');
  const [authModalMode, setAuthModalMode] = useState('sign-in');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isPlayerProfileModalOpen, setIsPlayerProfileModalOpen] = useState(false);
  const [userLeagues, setUserLeagues] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Check if URL contains ?skyball query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const showControls = urlParams.has('skyball') && isAuthenticated;

  // Player details management
  const {
    selectedPlayer,
    playerStats,
    playerMatchHistory,
    isPanelOpen,
    handlePlayerClick,
    handleSideTabClick,
    handleClosePlayer
  } = usePlayerDetails(rankings, allPlayerNames, setMessage, matches);

  const handleSignOut = () => {
    logout();
    setIsAuthModalOpen(false);
  };

  const openAuthModal = (mode) => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    // Don't clear pending action here - let the useEffect handle it after successful login
    // If user manually closes without logging in, we'll clear it when isAuthenticated stays false
  };

  // Check if user needs to complete profile after signup
  useEffect(() => {
    const checkPlayerProfile = async () => {
      if (isAuthenticated && justSignedUp) {
        try {
          console.log('Checking player profile after signup...');
          const player = await getCurrentUserPlayer();
          console.log('Player profile:', player);
          // Check if player profile needs completion (full_name is just a space or empty)
          if (player && (!player.full_name || player.full_name.trim() === '' || player.full_name === ' ')) {
            console.log('Profile needs completion, showing modal');
            // Close auth modal and show player profile modal
            setIsAuthModalOpen(false);
            // Small delay before showing profile modal for smooth transition
            setTimeout(() => {
              setIsPlayerProfileModalOpen(true);
            }, 200);
          } else {
            console.log('Profile is complete');
            // Profile is complete, just close auth modal
            setIsAuthModalOpen(false);
          }
          setJustSignedUp(false);
        } catch (error) {
          console.error('Error checking player profile:', error);
          // If error, assume profile needs completion
          setIsAuthModalOpen(false);
          setTimeout(() => {
            setIsPlayerProfileModalOpen(true);
          }, 200);
          setJustSignedUp(false);
        }
      }
    };

    checkPlayerProfile();
  }, [isAuthenticated, justSignedUp]);

  // Clear pending action if user closes modal without logging in
  useEffect(() => {
    if (!isAuthModalOpen && !isAuthenticated && pendingAction) {
      // Modal was closed and user is not authenticated - clear pending action
      setPendingAction(null);
    }
  }, [isAuthModalOpen, isAuthenticated, pendingAction]);

  // Execute pending action after successful authentication
  useEffect(() => {
    if (isAuthenticated && pendingAction) {
      // Close auth modal first if it's still open
      if (isAuthModalOpen) {
        setIsAuthModalOpen(false);
      }
      
      // Small delay to ensure modal closes smoothly before opening next action
      const timeoutId = setTimeout(() => {
        if (pendingAction.type === 'create-league') {
          setIsCreateLeagueModalOpen(true);
        } else if (pendingAction.type === 'view-league' && pendingAction.leagueId) {
          navigateToLeague(pendingAction.leagueId);
        }
        // Clear pending action after executing
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
      setMessage({
        type: 'success',
        text: `✓ League "${newLeague.name}" created successfully!`
      });
      // Reload leagues list
      const leagues = await getUserLeagues();
      setUserLeagues(leagues);
      // Navigate to the new league dashboard
      navigateToLeague(newLeague.id);
      return newLeague;
    } catch (error) {
      throw error; // Let the modal handle the error display
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'create-league') {
      if (!isAuthenticated) {
        // Store the pending action and open login modal
        setPendingAction({ type: 'create-league' });
        openAuthModal('sign-in');
        return;
      }
      setIsCreateLeagueModalOpen(true);
    } else if (action === 'view-league' && leagueId) {
      if (!isAuthenticated) {
        // Store the pending action and open login modal
        setPendingAction({ type: 'view-league', leagueId });
        openAuthModal('sign-in');
        return;
      }
      navigateToLeague(leagueId);
    } else if (leagueId) {
      if (!isAuthenticated) {
        // Store the pending action and open login modal
        setPendingAction({ type: 'view-league', leagueId });
        openAuthModal('sign-in');
        return;
      }
      navigateToLeague(leagueId);
    } else {
      console.log(`League action: ${action}`);
      // Handle other actions like join-league
    }
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <div className="container">
        <HeroHeader />
        {showControls && <ControlPanel onLoadFromSheets={handleLoadFromSheets} />}
        <Alert type={message?.type}>
          {message?.text}
        </Alert>
        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="content-area">
          {activeTab === 'matches' && (
            <MatchesTable 
              matches={matches} 
              onPlayerClick={handlePlayerClick}
              loading={loading}
              activeSession={activeSession}
              onCreateSession={handleCreateSession}
              onEndSession={handleEndSession}
              onDeleteSession={handleDeleteSession}
              onCreateMatch={handleCreateMatch}
              onUpdateMatch={handleUpdateMatch}
              onDeleteMatch={handleDeleteMatch}
              onCreatePlayer={handleCreatePlayer}
              allPlayerNames={allPlayerNames}
            />
          )}
          {activeTab === 'rankings' && (
            <RankingsTable 
              rankings={rankings} 
              onPlayerClick={handlePlayerClick}
              loading={loading}
            />
          )}
        </div>
      </div>
      <PlayerDetailsPanel
        selectedPlayer={selectedPlayer}
        playerStats={playerStats}
        playerMatchHistory={playerMatchHistory}
        isPanelOpen={isPanelOpen}
        allPlayerNames={allPlayerNames}
        onPlayerChange={handlePlayerClick}
        onClose={handleClosePlayer}
        onSideTabClick={handleSideTabClick}
      />
      <AuthModal 
        isOpen={isAuthModalOpen} 
        mode={authModalMode} 
        onClose={closeAuthModal}
        onVerifySuccess={() => {
          // Mark that user just signed up so we can check their profile
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
        onSuccess={() => {
          // Reload user data after profile update
          // The AuthContext will automatically refresh user data
        }}
      />
    </>
  );
}

export default App;
