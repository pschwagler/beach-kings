import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Trophy, Settings, ChevronDown, Users, Swords, MessageSquare } from 'lucide-react';
import MenuBar from '../navigation/MenuBar';
import NavDropdown from '../layout/navbar/NavDropdown';
import NavDropdownSection from '../layout/navbar/NavDropdownSection';
import NavDropdownItem from '../layout/navbar/NavDropdownItem';
import { LeagueSidebarTitleSkeleton } from '../ui/Skeletons';

/**
 * LeagueMenuBar
 *
 * League-specific configuration of the shared `MenuBar` component.
 * Renders league tabs (rankings, matches, signups, messages, details)
 * and, when not loading, a league switcher dropdown in the header.
 */

export default function LeagueMenuBar({
  leagueId,
  leagueName,
  activeTab,
  onTabChange,
  userLeagues,
  isAuthenticated,
  loading = false,
}) {
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const leagueDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(event.target)) {
        setIsLeagueDropdownOpen(false);
      }
    };

    if (isLeagueDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLeagueDropdownOpen]);

  const handleLeagueSelect = (selectedLeagueId) => {
    if (!selectedLeagueId || selectedLeagueId === leagueId) return;

    // Allow parent to control navigation via window.location / Next router
    window.location.href = `/league/${selectedLeagueId}`;
  };

  const titleNode = loading ? (
    <div className="league-sidebar-title-wrapper-container">
      <div className="league-sidebar-title-wrapper no-pointer">
        <LeagueSidebarTitleSkeleton />
      </div>
    </div>
  ) : (
    <div className="league-sidebar-title-wrapper-container" ref={leagueDropdownRef}>
      <button
        className="league-sidebar-title-wrapper"
        onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
        aria-label="Select league"
        type="button"
      >
        <h1 className="league-sidebar-title">{leagueName}</h1>
        <ChevronDown
          size={16}
          className={`league-sidebar-title-caret ${isLeagueDropdownOpen ? 'open' : ''}`}
        />
      </button>
      {isLeagueDropdownOpen && isAuthenticated && userLeagues?.length > 0 && (
        <div className="league-sidebar-dropdown">
          <NavDropdown className="league-sidebar-dropdown-menu">
            <NavDropdownSection title="My Leagues">
              {userLeagues.map((userLeague) => (
                <NavDropdownItem
                  key={userLeague.id}
                  icon={Users}
                  variant={userLeague.id === leagueId ? 'league' : 'default'}
                  onClick={() => handleLeagueSelect(userLeague.id)}
                  className={userLeague.id === leagueId ? 'league-sidebar-current' : ''}
                >
                  {userLeague.name}
                </NavDropdownItem>
              ))}
            </NavDropdownSection>
          </NavDropdown>
        </div>
      )}
    </div>
  );

  const items = [
    {
      id: 'rankings',
      label: 'Leaderboard',
      icon: Trophy,
      active: activeTab === 'rankings',
      onClick: () => onTabChange && onTabChange('rankings'),
      title: 'Leaderboard',
    },
    {
      id: 'matches',
      label: 'Games',
      icon: Swords,
      active: activeTab === 'matches',
      onClick: () => onTabChange && onTabChange('matches'),
      title: 'Games',
    },
    {
      id: 'signups',
      label: 'Sign Ups',
      icon: Calendar,
      active: activeTab === 'signups',
      onClick: () => onTabChange && onTabChange('signups'),
      title: 'Schedule & Sign Ups',
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      active: activeTab === 'messages',
      onClick: () => onTabChange && onTabChange('messages'),
      title: 'Messages',
    },
    {
      id: 'details',
      label: 'Details',
      icon: Settings,
      active: activeTab === 'details',
      onClick: () => onTabChange && onTabChange('details'),
      title: 'Details',
    },
  ];

  // When loading, we still show the same nav items but they can be disabled
  const loadingItems = items.map((item) => ({
    ...item,
    onClick: undefined,
  }));

  return (
    <MenuBar
      variant="league"
      titleNode={titleNode}
      items={loading ? loadingItems : items}
    />
  );
}
