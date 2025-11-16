import NavBrand from './navbar/NavBrand';
import RecordGamesButton from './navbar/RecordGamesButton';
import PlayersMenu from './navbar/PlayersMenu';
import LeaguesMenu from './navbar/LeaguesMenu';
import UserMenu from './navbar/UserMenu';

export default function NavBar({
  isLoggedIn = false,
  user,
  onSignOut,
  onSignIn,
  onSignUp,
  onSmsLogin,
  userLeagues = [],
}) {
  const handleRecordGamesClick = () => {
    console.log('Navigate to Record Games');
    // Handle navigation to record games page
  };

  const handlePlayersMenuClick = (action) => {
    console.log(`Players menu action: ${action}`);
    // Handle players menu actions
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (leagueId) {
      console.log(`Navigate to league: ${leagueId}`);
      // Handle league navigation
    } else {
      console.log(`League action: ${action}`);
      // Handle join/create actions
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
          
          <PlayersMenu onMenuClick={handlePlayersMenuClick} />
          
          <LeaguesMenu
            isLoggedIn={isLoggedIn}
            userLeagues={userLeagues}
            onMenuClick={handleLeaguesMenuClick}
          />
          
          <UserMenu
            isLoggedIn={isLoggedIn}
            user={user}
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
