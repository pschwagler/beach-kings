'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '../../contexts/NotificationContext';
import { useToast } from '../../contexts/ToastContext';
import { Bell, Check, Filter } from 'lucide-react';
import {
  approveLeagueJoinRequest,
  rejectLeagueJoinRequest,
  acceptFriendRequest,
  declineFriendRequest,
} from '../../services/api';
import '../notifications/NotificationInbox.css';

export default function NotificationsTab() {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    fetchUnreadCount,
  } = useNotifications();
  
  const [showReadNotifications, setShowReadNotifications] = useState(false);
  const [filteredNotifications, setFilteredNotifications] = useState([]);

  // Fetch notifications when component mounts or filter changes
  useEffect(() => {
    const loadNotifications = async () => {
      if (showReadNotifications) {
        // Fetch all notifications
        await fetchNotifications(50, 0, false);
      } else {
        // Fetch only unread notifications
        await fetchNotifications(50, 0, true);
      }
      await fetchUnreadCount();
    };
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReadNotifications]); // fetchNotifications and fetchUnreadCount are stable from context

  // Update filtered notifications when notifications or filter changes
  useEffect(() => {
    if (showReadNotifications) {
      setFilteredNotifications(notifications);
    } else {
      setFilteredNotifications(notifications.filter(n => !n.is_read));
    }
  }, [notifications, showReadNotifications]);

  const handleNotificationClick = async (notification) => {
    // Mark as read if not already read
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
        await fetchUnreadCount();
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    // Navigate to link_url if provided
    if (notification.link_url) {
      router.push(notification.link_url);
    }
  };

  const handleMarkAsRead = async (e, notificationId) => {
    e.stopPropagation();
    try {
      await markAsRead(notificationId);
      await fetchUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      await fetchUnreadCount();
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
      await fetchNotifications(50, 0, !showReadNotifications);
      await fetchUnreadCount();
    } catch (error) {
      console.error(`Error performing ${action.action} action:`, error);
      showToast(error.response?.data?.detail || `Failed to ${action.action} request`, 'error');
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

  return (
    <div className="profile-page__section league-section">
      <div className="notifications-tab-header">
        <h2 className="profile-page__section-title section-title-first">Notifications</h2>
        <div className="notifications-tab-controls">
          {hasUnread && (
            <button
              className="notifications-tab-mark-all"
              data-testid="notifications-mark-all"
              onClick={handleMarkAllAsRead}
              type="button"
            >
              Mark all as read
            </button>
          )}
          <button
            className={`notifications-tab-filter ${showReadNotifications ? 'active' : ''}`}
            onClick={() => setShowReadNotifications(!showReadNotifications)}
            type="button"
          >
            <Filter size={16} />
            <span>{showReadNotifications ? 'Show unread only' : 'Show read notifications'}</span>
          </button>
        </div>
      </div>

      <div className="notifications-tab-content">
        {isLoading ? (
          <div className="notifications-tab-empty">Loading notifications...</div>
        ) : filteredNotifications.length === 0 ? (
          <div className="notifications-tab-empty">
            <Bell size={48} className="notifications-empty-icon" />
            <p>
              {showReadNotifications 
                ? 'No notifications' 
                : 'No unread notifications'}
            </p>
          </div>
        ) : (
          <div className="notifications-tab-list" data-testid="notifications-list">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`notifications-tab-item ${!notification.is_read ? 'unread' : ''}`}
                data-testid="notification-item"
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
                <div className="notifications-tab-item-content">
                  <div className="notifications-tab-item-header">
                    <div className="notifications-tab-item-title" data-testid="notification-title">{notification.title}</div>
                    {!notification.is_read && (
                      <button
                        className="notifications-tab-item-mark-read"
                        data-testid="notification-mark-read"
                        onClick={(e) => handleMarkAsRead(e, notification.id)}
                        title="Mark as read"
                        type="button"
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                  <div className="notifications-tab-item-message" data-testid="notification-message">{notification.message}</div>
                  {notification.data?.actions && notification.data.actions.length > 0 && (
                    <div className="notifications-tab-item-actions">
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
                  <div className="notifications-tab-item-time">
                    {formatTimestamp(notification.created_at)}
                  </div>
                </div>
                {!notification.is_read && (
                  <div className="notifications-tab-item-dot" data-testid="notification-unread-dot" aria-label="Unread" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
