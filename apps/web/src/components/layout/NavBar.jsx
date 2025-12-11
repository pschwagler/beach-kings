'use client';

import { useRouter } from 'next/navigation';
import NavBrand from './navbar/NavBrand';
import RecordGamesButton from './navbar/RecordGamesButton';
import PlayersButton from './navbar/PlayersMenu';
import LeaguesMenu from './navbar/LeaguesMenu';
import UserMenu from './navbar/UserMenu';

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

  const handleRecordGamesClick = () => {
    // Handle navigation to record games page
  };

  const handlePlayersClick = () => {
    // Handle players button click
    if (onPlayersClick) {
      onPlayersClick();
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
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

  return (
    <nav className="navbar" data-nextjs-scroll-focus-boundary>
      <div className="navbar-container">
        <NavBrand />
        
        <div className="navbar-right">
          {/* TODO: Add functionality for Record Games and Players buttons */}
          {/* <RecordGamesButton onClick={handleRecordGamesClick} /> */}
          
          {/* <PlayersButton onClick={handlePlayersClick} /> */}
          
          <LeaguesMenu
            isLoggedIn={isLoggedIn}
            userLeagues={userLeagues}
            onMenuClick={handleLeaguesMenuClick}
          />
          
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
