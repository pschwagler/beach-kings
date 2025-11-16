import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Users, Search, UserCheck, Trophy } from 'lucide-react';
import NavDropdown from './NavDropdown';
import NavDropdownSection from './NavDropdownSection';
import NavDropdownItem from './NavDropdownItem';

export default function PlayersMenu({ onMenuClick }) {
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
    if (onMenuClick) {
      onMenuClick(action);
    }
  };

  return (
    <div className="navbar-menu-group" ref={menuRef}>
      <button
        className="navbar-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Players menu"
      >
        <Users size={20} />
        <span className="navbar-menu-label">Players</span>
        <ChevronDown 
          size={16} 
          className={`navbar-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <NavDropdown className="navbar-dropdown-players">
          <NavDropdownSection>
            <NavDropdownItem
              icon={Trophy}
              onClick={() => handleItemClick('rankings')}
            >
              Rankings
            </NavDropdownItem>
            <NavDropdownItem
              icon={Search}
              onClick={() => handleItemClick('search-player')}
            >
              Search for Player
            </NavDropdownItem>
            <NavDropdownItem
              icon={UserCheck}
              onClick={() => handleItemClick('claim-player')}
            >
              Claim Player
            </NavDropdownItem>
          </NavDropdownSection>
        </NavDropdown>
      )}
    </div>
  );
}

