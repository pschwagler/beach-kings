'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import NotificationInbox from './NotificationInbox';

export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleInbox = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="notification-bell-container" ref={bellRef}>
      <button
        className="notification-bell-button"
        onClick={toggleInbox}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="notification-bell-icon" size={20} />
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && <NotificationInbox onClose={() => setIsOpen(false)} />}
    </div>
  );
}

