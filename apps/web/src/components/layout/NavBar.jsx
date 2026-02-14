'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import NavBrand from './navbar/NavBrand';
import RecordGamesButton from './navbar/RecordGamesButton';
import PlayersButton from './navbar/PlayersMenu';
import LeaguesMenu from './navbar/LeaguesMenu';
import UserMenu from './navbar/UserMenu';
import NotificationBell from '../notifications/NotificationBell';

export default function NavBar({
  isLoggedIn = false,
  user,
  currentUserPlayer,
  onSignOut,
  onSignIn,
  onSignUp,
  onSmsLogin,
  userLeagues = [],
  onLeaguesMenuClick,
  onPlayersClick,
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { openModal } = useModal();

  const handleRecordGamesClick = () => {
    openModal(MODAL_TYPES.CREATE_GAME);
  };

  const handlePlayersClick = () => {
    // Handle players button click
    if (onPlayersClick) {
      onPlayersClick();
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'find-leagues') {
      router.push('/find-leagues');
      return;
    }
    if (onLeaguesMenuClick) {
      onLeaguesMenuClick(action, leagueId);
    }
  };

  const handleUserMenuClick = (action) => {
    if (action === 'profile') {
      router.push('/profile');
    }
    // Handle user menu actions (except sign-out which is handled by onSignOut)
  };

  const handleHomeClick = () => {
    router.push(isAuthenticated ? '/home' : '/');
  };

  return (
    <nav className="navbar" data-nextjs-scroll-focus-boundary>
      <div className="navbar-container">
        <div className="navbar-left">
          <button
            type="button"
            className="navbar-home-button"
            onClick={handleHomeClick}
            aria-label="Home"
          >
            <svg
              className="navbar-home-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5a.5.5 0 0 1-.5-.5V15a2 2 0 0 0-4 0v5.5a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1v-8.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="navbar-center">
          <NavBrand />
        </div>
        
        <div className="navbar-right">
          {isAuthenticated && (
            <RecordGamesButton onClick={handleRecordGamesClick} />
          )}
          
          <LeaguesMenu
            isLoggedIn={isLoggedIn}
            userLeagues={userLeagues}
            onMenuClick={handleLeaguesMenuClick}
          />
          
          {isAuthenticated && <NotificationBell />}
          
          <UserMenu
            isLoggedIn={isLoggedIn}
            user={user}
            currentUserPlayer={currentUserPlayer}
            onMenuClick={handleUserMenuClick}
            onSignIn={onSignIn}
            onSignUp={onSignUp}
            onSmsLogin={onSmsLogin}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </nav>
  );
}
