/**
 * Notification endpoints — get notifications, unread count, mark read.
 */

import api from '../api-client';
import type { Notification } from '../../types';

/**
 * Get user notifications with pagination
 */
export const getNotifications = async (params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}): Promise<{ items: Notification[]; total_count: number; has_more: boolean }> => {
  const { limit = 50, offset = 0, unreadOnly = false } = params;
  const response = await api.get('/api/notifications', {
    params: { limit, offset, unread_only: unreadOnly }
  });
  return response.data;
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (): Promise<{ count: number }> => {
  const response = await api.get('/api/notifications/unread-count');
  return response.data;
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (notificationId: number): Promise<Notification> => {
  const response = await api.put(`/api/notifications/${notificationId}/read`);
  return response.data;
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (): Promise<{ updated_count: number }> => {
  const response = await api.put('/api/notifications/mark-all-read');
  return response.data;
};
