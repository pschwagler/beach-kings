import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Trophy, Plus, CalendarPlus, Users } from 'lucide-react';
import NavDropdown from './NavDropdown';
import NavDropdownSection from './NavDropdownSection';
import NavDropdownItem from './NavDropdownItem';

export default function LeaguesMenu({ isLoggedIn, userLeagues = [], onMenuClick }) {
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

  const handleItemClick = (action, leagueId = null) => {
    setIsOpen(false);
    if (onMenuClick) {
      onMenuClick(action, leagueId);
    }
  };

  return (
    <div className="navbar-menu-group" ref={menuRef}>
      <button
        className="navbar-menu-button"
        onClick={() => setIsOpen(!isOpen)}
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
              icon={CalendarPlus}
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

