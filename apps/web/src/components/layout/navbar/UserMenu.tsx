'use client';

import { useRef } from 'react';
import { User, LogIn, UserPlus, Home, UserCircle, MessageSquare, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import NavDropdown from './NavDropdown';
import NavDropdownItem from './NavDropdownItem';
import type { User as UserType, Player } from '../../../types';
import { useClickOutside } from '../../../hooks/useClickOutside';

/**
 * Gets the avatar image URL and fallback initial for the navbar.
 * Prefers player avatar (backend-provided initials or URL), then email initial.
 */
const getAvatarData = (user: UserType | null | undefined, currentUserPlayer: Player | null | undefined): { imageUrl: string | null; initial: string | null } => {
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

interface UserMenuProps {
  isLoggedIn?: boolean;
  user?: UserType | null;
  currentUserPlayer?: Player | null;
  onMenuClick?: (action: string) => void;
  onSignIn?: () => void;
  onSignUp?: () => void;
  onSmsLogin?: () => void;
  onSignOut?: () => void;
  /** Controlled open state lifted into NavBar. */
  isOpen: boolean;
  /** Called when the trigger button is clicked; parent toggles the state. */
  onToggle: () => void;
  /** Called to explicitly close the menu (e.g. click-outside, item click). */
  onClose: () => void;
}

export default function UserMenu({
  isLoggedIn,
  user,
  currentUserPlayer,
  onMenuClick,
  onSignIn,
  onSignUp,
  onSignOut,
  isOpen,
  onToggle,
  onClose,
}: UserMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, isOpen, onClose);

  const handleItemClick = (action: string) => {
    onClose();
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
        onClick={onToggle}
        aria-label="User menu"
      >
        {isLoggedIn ? (
          avatarImageUrl ? (
            <div className="navbar-avatar navbar-avatar-image" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
              <NavDropdownItem icon={MessageSquare} onClick={() => handleItemClick('feedback')}>
                Leave Feedback
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
