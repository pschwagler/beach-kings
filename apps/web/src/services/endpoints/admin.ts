/**
 * Admin endpoints — stats, config, feedback, recent players, health check.
 */

import api from '../api-client';
import type { Feedback } from '../../types';

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

export interface PlatformRoleHistory {
  id: number;
  role: 'system_admin';
  granted_at: string;
  granted_by_user_id: number | null;
  grant_source: string;
  grant_reason: string;
  revoked_at: string | null;
  revoked_by_user_id: number | null;
  revoke_source: string | null;
  revoke_reason: string | null;
}

export interface AdminUser {
  id: number;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  auth_provider: string;
  is_verified: boolean;
  created_at: string;
  deletion_scheduled_at: string | null;
  deleted_at: string | null;
  moderation_status: 'active' | 'suspended' | 'banned';
  moderation_expires_at: string | null;
  is_system_admin: boolean;
  role_history: PlatformRoleHistory[];
}

export interface AdminUsersResponse {
  items: AdminUser[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
}

export const getAdminUsers = async (params: Record<string, string | number | undefined>) =>
  (await api.get<AdminUsersResponse>('/api/admin-view/users', { params })).data;

export const grantSystemAdmin = async (userId: number, reason: string) =>
  (await api.post(`/api/admin-view/users/${userId}/roles/system_admin`, { reason })).data;

export const revokeSystemAdmin = async (userId: number, reason: string) =>
  (await api.post(`/api/admin-view/users/${userId}/roles/system_admin/revoke`, { reason })).data;

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

export type ModerationQueue = 'urgent' | 'due' | 'overdue' | 'ordinary';
export type ModerationState = 'active' | 'open' | 'acknowledged' | 'closed' | 'all';

export interface ModerationCaseFilters {
  queue?: ModerationQueue;
  state?: ModerationState;
  target_type?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export const getModerationCases = async (params: ModerationCaseFilters = {}) => {
  const response = await api.get('/api/admin-view/moderation/cases', { params });
  return response.data;
};

export const getModerationOverview = async () =>
  (await api.get('/api/admin-view/moderation/overview')).data;

export const getModerationCase = async (caseId: number) => {
  return (await api.get(`/api/admin-view/moderation/cases/${caseId}`)).data;
};

export const getModerationContext = async (caseId: number) => {
  return (await api.get(`/api/admin-view/moderation/cases/${caseId}/context`)).data;
};

export const applyModerationAction = async (
  caseId: number,
  input: { action: string; reason: string; lock_hours?: number; legal_hold?: boolean; appeal_id?: number },
) => (await api.post(`/api/admin-view/moderation/cases/${caseId}/actions`, input)).data;

export const createModerationEscalation = async (
  caseId: number,
  input: { channel: string; jurisdiction: string; external_reference?: string; note: string },
) => (await api.post(`/api/admin-view/moderation/cases/${caseId}/escalations`, input)).data;

export const retryModerationJob = async (jobId: number, reason: string) =>
  (await api.post(`/api/admin-view/moderation/jobs/${jobId}/retry`, { reason })).data;

export const getModerationEvidenceUrl = async (caseId: number, evidenceId: number) =>
  (await api.get(`/api/admin-view/moderation/cases/${caseId}/evidence/${evidenceId}/url`)).data;
