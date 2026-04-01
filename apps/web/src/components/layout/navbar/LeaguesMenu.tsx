import { useRef } from 'react';
import { ChevronDown, Trophy, Plus, Search, Users } from 'lucide-react';
import NavDropdown from './NavDropdown';
import NavDropdownSection from './NavDropdownSection';
import NavDropdownItem from './NavDropdownItem';
import type { League } from '../../../types';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface LeaguesMenuProps {
  isLoggedIn?: boolean;
  userLeagues?: League[];
  onMenuClick?: (action: string, leagueId?: number | null) => void;
  /** Controlled open state lifted into NavBar. */
  isOpen: boolean;
  /** Called when the trigger button is clicked; parent toggles the state. */
  onToggle: () => void;
  /** Called to explicitly close the menu (e.g. click-outside, item click). */
  onClose: () => void;
}

export default function LeaguesMenu({
  isLoggedIn,
  userLeagues = [],
  onMenuClick,
  isOpen,
  onToggle,
  onClose,
}: LeaguesMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, isOpen, onClose);

  const handleItemClick = (action: string, leagueId: number | null = null) => {
    onClose();
    if (onMenuClick) {
      onMenuClick(action, leagueId);
    }
  };

  return (
    <div className="navbar-menu-group" ref={menuRef}>
      <button
        className="navbar-menu-button"
        onClick={onToggle}
        aria-label="Leagues menu"
      >
        <Trophy size={16} />
        <span className="navbar-menu-label">Leagues</span>
        <ChevronDown 
          size={16} 
          className={`navbar-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <NavDropdown className="navbar-dropdown-leagues">
          {/* User's Leagues (if logged in) */}
          {isLoggedIn && userLeagues && userLeagues.length > 0 && (
            <>
              <NavDropdownSection title="My Leagues">
                {userLeagues.map((league) => (
                  <NavDropdownItem
                    key={league.id}
                    icon={Users}
                    variant="league"
                    onClick={() => handleItemClick('view-league', league.id)}
                  >
                    {league.name}
                  </NavDropdownItem>
                ))}
              </NavDropdownSection>
              <div className="navbar-dropdown-divider"></div>
            </>
          )}
          
          {/* Action Items */}
          <NavDropdownSection>
            <NavDropdownItem
              icon={Search}
              onClick={() => handleItemClick('find-leagues')}
            >
              Find Leagues
            </NavDropdownItem>
            <NavDropdownItem
              icon={Plus}
              onClick={() => handleItemClick('create-league')}
            >
              Create League
            </NavDropdownItem>
          </NavDropdownSection>
        </NavDropdown>
      )}
    </div>
  );
}
