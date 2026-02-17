'use client';

import { useState, useRef, useEffect } from 'react';
import { User, LogIn, UserPlus, Home, UserCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import NavDropdown from './NavDropdown';
import NavDropdownItem from './NavDropdownItem';

/**
 * Gets the avatar image URL and fallback initial for the navbar.
 * Prefers player avatar (backend-provided initials or URL), then email initial.
 */
const getAvatarData = (user, currentUserPlayer) => {
  // Prefer avatar coming from player API (can be URL or initials string)
  if (currentUserPlayer?.avatar) {
    // If it looks like a URL or path, treat as image, otherwise as initials
    const avatar = currentUserPlayer.avatar;
    const isImage =
      typeof avatar === 'string' &&
      (avatar.startsWith('http://') ||
        avatar.startsWith('https://') ||
        avatar.startsWith('/'));
    if (isImage) {
      return { imageUrl: avatar, initial: null };
    }
    return { imageUrl: null, initial: avatar.trim().charAt(0).toUpperCase() };
  }

  // Fall back to nickname / full_name / email for initial only
  if (currentUserPlayer?.nickname) {
    return { imageUrl: null, initial: currentUserPlayer.nickname.trim().charAt(0).toUpperCase() };
  }
  if (currentUserPlayer?.full_name) {
    return { imageUrl: null, initial: currentUserPlayer.full_name.trim().charAt(0).toUpperCase() };
  }
  if (user?.email) {
    return { imageUrl: null, initial: user.email.trim().charAt(0).toUpperCase() };
  }

  return { imageUrl: null, initial: null };
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
  const router = useRouter();
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
      case 'home':
        router.push('/home');
        break;
      case 'profile':
        router.push('/home?tab=profile');
        break;
      default:
        onMenuClick?.(action);
    }
  };

  const { imageUrl: avatarImageUrl, initial: avatarInitial } = isLoggedIn
    ? getAvatarData(user, currentUserPlayer)
    : { imageUrl: null, initial: null };

  return (
    <div className="navbar-menu-group" ref={menuRef}>
      <button
        className="navbar-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        {isLoggedIn ? (
          avatarImageUrl ? (
            <div className="navbar-avatar navbar-avatar-image" aria-hidden="true">
              <img src={avatarImageUrl} alt={currentUserPlayer?.full_name || 'User'} />
            </div>
          ) : avatarInitial ? (
            <div className="navbar-avatar" aria-hidden="true">
              {avatarInitial}
            </div>
          ) : (
            <User size={20} />
          )
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
              <NavDropdownItem icon={Home} onClick={() => handleItemClick('home')}>
                Home
              </NavDropdownItem>
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
