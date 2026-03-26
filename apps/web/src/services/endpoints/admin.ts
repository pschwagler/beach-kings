/**
 * Admin endpoints — stats, config, feedback, recent players, health check, loadFromSheets.
 */

import api from '../api-client';
import type { Feedback } from '../../types';

/**
 * Load matches from Google Sheets and calculate statistics
 */
export const loadFromSheets = async () => {
  const response = await api.post('/api/loadsheets');
  return response.data;
};

/**
 * Health check
 */
export const healthCheck = async () => {
  const response = await api.get('/api/health');
  return response.data;
};

/**
 * Get platform-wide summary stats (admin only, cached).
 */
export const getAdminStats = async () => {
  const response = await api.get('/api/admin-view/stats');
  return response.data;
};

/** Admin: get recently created players. */
export const getAdminRecentPlayers = async (
  limit: number = 50,
  includeUnregistered: boolean = false,
) => {
  const response = await api.get('/api/admin-view/players/recent', {
    params: { limit, include_unregistered: includeUnregistered },
  });
  return response.data;
};

/**
 * Get admin configuration settings
 */
export const getAdminConfig = async () => {
  const response = await api.get('/api/admin-view/config');
  return response.data;
};

/**
 * Update admin configuration settings
 */
export const updateAdminConfig = async (config: Record<string, any>) => {
  const response = await api.put('/api/admin-view/config', config);
  return response.data;
};

/**
 * Get all feedback submissions (admin only)
 */
export const getAdminFeedback = async (): Promise<Feedback[]> => {
  const response = await api.get('/api/admin-view/feedback');
  return response.data;
};

/**
 * Update feedback resolution status (admin only)
 */
export const updateFeedbackResolution = async (feedbackId: number, isResolved: boolean) => {
  const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, {
    is_resolved: isResolved
  });
  return response.data;
};

/**
 * Submit feedback (works for both authenticated and anonymous users)
 */
export const submitFeedback = async ({ feedback, email }: { feedback: string; email?: string }) => {
  const response = await api.post('/api/feedback', {
    feedback_text: feedback,
    email: email || undefined
  });
  return response.data;
};
