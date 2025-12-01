import { useState, useRef, useEffect } from 'react';
import { User, LogIn, UserPlus, UserCircle, LogOut } from 'lucide-react';
import NavDropdown from './NavDropdown';
import NavDropdownItem from './NavDropdownItem';

/**
 * Gets the first letter for the avatar from player nickname, full_name, email, or defaults to a user icon
 */
const getAvatarInitial = (user, currentUserPlayer) => {
  // First check player nickname
  if (currentUserPlayer?.nickname) {
    return currentUserPlayer.nickname.trim().charAt(0).toUpperCase();
  }
  // Then check player full_name
  if (currentUserPlayer?.full_name) {
    return currentUserPlayer.full_name.trim().charAt(0).toUpperCase();
  }
  // Fall back to user email
  if (user?.email) {
    return user.email.trim().charAt(0).toUpperCase();
  }
  return null; // Will show default icon
};

export default function UserMenu({
  isLoggedIn,
  user,
  currentUserPlayer,
  onMenuClick,
  onSignIn,
  onSignUp,
  onSignOut,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleItemClick = (action) => {
    setIsOpen(false);
    switch (action) {
      case 'sign-in':
        onSignIn?.();
        break;
      case 'sign-up':
        onSignUp?.();
        break;
      case 'sign-out':
        onSignOut?.();
        break;
      default:
        onMenuClick?.(action);
    }
  };

  const avatarInitial = isLoggedIn ? getAvatarInitial(user, currentUserPlayer) : null;

  return (
    <div className="navbar-menu-group" ref={menuRef}>
      <button
        className="navbar-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        {isLoggedIn && avatarInitial ? (
          <div className="navbar-avatar" aria-hidden="true">
            {avatarInitial}
          </div>
        ) : (
          <User size={20} />
        )}
        <span className="navbar-menu-label"></span>
      </button>

      {isOpen && (
        <NavDropdown className="navbar-dropdown-user">
          {!isLoggedIn ? (
            <>
              <NavDropdownItem icon={LogIn} onClick={() => handleItemClick('sign-in')}>
                Log In
              </NavDropdownItem>
              <NavDropdownItem icon={UserPlus} onClick={() => handleItemClick('sign-up')}>
                Sign Up
              </NavDropdownItem>
            </>
          ) : (
            <>
              <div className="navbar-dropdown-header">
                {currentUserPlayer?.full_name || user?.phone_number || 'Member'}
              </div>
              <NavDropdownItem icon={UserCircle} onClick={() => handleItemClick('profile')}>
                My Profile
              </NavDropdownItem>
              <NavDropdownItem
                icon={LogOut}
                variant="danger"
                onClick={() => handleItemClick('sign-out')}
              >
                Sign Out
              </NavDropdownItem>
            </>
          )}
        </NavDropdown>
      )}
    </div>
  );
}

