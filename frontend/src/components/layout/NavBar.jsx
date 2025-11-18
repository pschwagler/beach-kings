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
  const handleRecordGamesClick = () => {
    console.log('Navigate to Record Games');
    // Handle navigation to record games page
  };

  const handlePlayersClick = () => {
    // Handle players button click
    if (onPlayersClick) {
      onPlayersClick();
    } else {
      console.log('Players button clicked');
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (onLeaguesMenuClick) {
      onLeaguesMenuClick(action, leagueId);
    } else {
      // Fallback to console log if handler not provided
      if (leagueId) {
        console.log(`Navigate to league: ${leagueId}`);
      } else {
        console.log(`League action: ${action}`);
      }
    }
  };

  const handleUserMenuClick = (action) => {
    console.log(`User menu action: ${action}`);
    // Handle user menu actions (except sign-out which is handled by onSignOut)
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <NavBrand />
        
        <div className="navbar-right">
          <RecordGamesButton onClick={handleRecordGamesClick} />
          
          <PlayersButton onClick={handlePlayersClick} />
          
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
