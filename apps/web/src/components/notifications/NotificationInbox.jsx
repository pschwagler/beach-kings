'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../../contexts/NotificationContext';
import './NotificationInbox.css';

export default function NotificationInbox({ onClose }) {
  const router = useRouter();
  const { 
    notifications, 
    isLoading, 
    markAsRead, 
    markAllAsRead,
    fetchNotifications 
  } = useNotifications();

  // Fetch notifications when inbox opens
  useEffect(() => {
    if (!isLoading && notifications.length === 0) {
      fetchNotifications();
    }
  }, [isLoading, notifications.length, fetchNotifications]);

  const handleNotificationClick = async (notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    // Navigate to link_url if provided
    if (notification.link_url) {
      router.push(notification.link_url);
      onClose();
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const hasUnread = notifications.some(n => !n.is_read);

  return (
    <div className="notification-inbox">
      <div className="notification-inbox-header">
        <h3 className="notification-inbox-title">Notifications</h3>
        {hasUnread && (
          <button
            className="notification-inbox-mark-all"
            onClick={handleMarkAllAsRead}
            type="button"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="notification-inbox-content">
        {isLoading ? (
          <div className="notification-inbox-empty">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="notification-inbox-empty">No notifications</div>
        ) : (
          <div className="notification-inbox-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-inbox-item ${!notification.is_read ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(notification)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNotificationClick(notification);
                  }
                }}
              >
                <div className="notification-inbox-item-content">
                  <div className="notification-inbox-item-title">{notification.title}</div>
                  <div className="notification-inbox-item-message">{notification.message}</div>
                  <div className="notification-inbox-item-time">
                    {formatTimestamp(notification.created_at)}
                  </div>
                </div>
                {!notification.is_read && (
                  <div className="notification-inbox-item-dot" aria-label="Unread" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

