import React, { useEffect, useRef, useState } from 'react';
import { Home, User, Users, Trophy, Menu, Search, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import MenuBar from '../navigation/MenuBar';

/**
 * HomeMenuBar
 *
 * Home/dashboard configuration of the shared `MenuBar` component.
 * On desktop it appears as the left dashboard rail; on mobile it
 * becomes the bottom navigation menubar (Home/Profile/Leagues/Friends/More).
 */

export default function HomeMenuBar({ activeTab }) {
  const router = useRouter();
  const [moreMenuExpanded, setMoreMenuExpanded] = useState(false);
  const moreMenuRef = useRef(null);
  const moreMenuPortalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedInsideButton = moreMenuRef.current?.contains(event.target);
      const clickedInsidePortal = moreMenuPortalRef.current?.contains(event.target);

      if (!clickedInsideButton && !clickedInsidePortal) {
        setMoreMenuExpanded(false);
      }
    };

    if (moreMenuExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [moreMenuExpanded]);

  const handleTabChange = (tab) => {
    const params = new URLSearchParams(window.location.search || '');
    params.set('tab', tab);
    router.push(`/home?${params.toString()}`);

    if (window.innerWidth <= 768) {
      setMoreMenuExpanded(false);
    }
  };

  const items = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      active: activeTab === 'home',
      onClick: () => handleTabChange('home'),
      title: 'Home',
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      active: activeTab === 'profile',
      onClick: () => handleTabChange('profile'),
      title: 'Profile',
    },
    {
      id: 'leagues',
      label: 'My Leagues',
      icon: Trophy,
      active: activeTab === 'leagues',
      onClick: () => handleTabChange('leagues'),
      title: 'Leagues',
    },
    {
      id: 'friends',
      label: 'Friends',
      icon: Users,
      active: activeTab === 'friends',
      onClick: () => handleTabChange('friends'),
      title: 'Friends',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      active: activeTab === 'notifications',
      onClick: () => handleTabChange('notifications'),
      title: 'Notifications',
      className: 'notifications-menu-item-desktop',
    },
    {
      id: 'find-leagues',
      label: 'Find New Leagues',
      icon: Search,
      active: false,
      onClick: () => router.push('/find-leagues'),
      title: 'Find New Leagues',
      className: 'find-leagues-menu-item-desktop',
    },
    {
      id: 'more',
      label: 'More',
      icon: Menu,
      active: moreMenuExpanded,
      onClick: () => setMoreMenuExpanded((prev) => !prev),
      title: 'More',
      className: 'more-menu-item-mobile',
    },
  ];

  return (
    <MenuBar variant="home" title="Dashboard" items={items}>
      {({ moreButtonRef }) => (
        <div className="league-sidebar-nav-group" ref={moreMenuRef}>
          {moreMenuExpanded &&
            typeof window !== 'undefined' &&
            createPortal(
              <div
                ref={moreMenuPortalRef}
                className="league-sidebar-more-menu-portal"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  ...(window.innerWidth <= 768
                    ? {
                        right: '0',
                        bottom: moreButtonRef.current
                          ? `${window.innerHeight - moreButtonRef.current.getBoundingClientRect().top + 8}px`
                          : 'auto',
                      }
                    : {
                        left: moreButtonRef.current
                          ? `${moreButtonRef.current.getBoundingClientRect().right + 8}px`
                          : 'auto',
                        top: moreButtonRef.current
                          ? `${moreButtonRef.current.getBoundingClientRect().top}px`
                          : 'auto',
                      }),
                }}
              >
                <div className="league-sidebar-more-menu">
                  <button
                    className="league-sidebar-more-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTabChange('notifications');
                      setMoreMenuExpanded(false);
                    }}
                    title="Notifications"
                    type="button"
                  >
                    <Bell size={18} />
                    <span>Notifications</span>
                  </button>
                  <button
                    className="league-sidebar-more-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push('/find-leagues');
                      setMoreMenuExpanded(false);
                    }}
                    title="Find New Leagues"
                    type="button"
                  >
                    <Search size={18} />
                    <span>Find New Leagues</span>
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>
      )}
    </MenuBar>
  );
}

