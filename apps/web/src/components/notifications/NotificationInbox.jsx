'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../../contexts/NotificationContext';
import { approveLeagueJoinRequest, rejectLeagueJoinRequest, acceptFriendRequest, declineFriendRequest } from '../../services/api';
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
  // Fetch unread notifications when inbox opens (only once per mount)
  useEffect(() => {
    if (!isLoading) {
      fetchNotifications(50, 0, true); // unreadOnly = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - fetchNotifications is stable from context

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

  const handleNotificationAction = async (e, notification, action) => {
    e.stopPropagation();

    try {
      // Friend request actions
      if (action.action === 'accept_friend' || action.action === 'decline_friend') {
        const { friend_request_id } = notification.data || {};
        if (!friend_request_id) {
          console.error('Missing friend_request_id in notification data');
          return;
        }
        if (action.action === 'accept_friend') {
          await acceptFriendRequest(friend_request_id);
        } else {
          await declineFriendRequest(friend_request_id);
        }
      } else {
        // League actions (approve/reject)
        const { league_id, request_id } = notification.data || {};
        if (!league_id || !request_id) {
          console.error('Missing league_id or request_id in notification data');
          return;
        }
        if (action.action === 'approve') {
          await approveLeagueJoinRequest(league_id, request_id);
        } else if (action.action === 'reject') {
          await rejectLeagueJoinRequest(league_id, request_id);
        }
      }

      // Mark notification as read and refresh
      await markAsRead(notification.id);
      await fetchNotifications(50, 0, true); // Refresh unread notifications
    } catch (error) {
      console.error(`Error performing ${action.action} action:`, error);
      alert(error.response?.data?.detail || `Failed to ${action.action} request`);
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

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const hasUnread = unreadNotifications.length > 0;

  const handleViewAllClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    router.push('/home?tab=notifications');
    onClose();
  };

  return (
    <div className="notification-inbox">
      <div className="notification-inbox-header">
        <h3 className="notification-inbox-title">Notifications</h3>
        <a
          href="/home?tab=notifications"
          onClick={handleViewAllClick}
          className="notification-inbox-view-all"
        >
          View all notifications
        </a>
      </div>

      <div className="notification-inbox-content">
        {isLoading ? (
          <div className="notification-inbox-empty">Loading notifications...</div>
        ) : unreadNotifications.length === 0 ? (
          <div className="notification-inbox-empty">No unread notifications</div>
        ) : (
          <div className="notification-inbox-list">
            {unreadNotifications.map((notification) => (
              <div
                key={notification.id}
                className="notification-inbox-item unread"
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
                  {notification.data?.actions && notification.data.actions.length > 0 && (
                    <div className="notification-inbox-item-actions">
                      {notification.data.actions.map((action, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`notification-action-button notification-action-${action.style || 'primary'}`}
                          onClick={(e) => handleNotificationAction(e, notification, action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="notification-inbox-item-time">
                    {formatTimestamp(notification.created_at)}
                  </div>
                </div>
                <div className="notification-inbox-item-dot" aria-label="Unread" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

