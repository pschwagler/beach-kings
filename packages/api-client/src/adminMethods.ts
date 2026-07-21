import type { AxiosInstance } from 'axios';

/** API methods for the Feedback, admin, and health domain. */
export function createAdminMethods(api: AxiosInstance) {
  return {

    // -----------------------------------------------------------------------
    // Feedback
    // -----------------------------------------------------------------------

    async submitFeedback(feedback: string, email?: string) {
      const response = await api.post('/api/feedback', { feedback_text: feedback, email: email || undefined });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    async getAdminConfig() {
      const response = await api.get('/api/admin-view/config');
      return response.data;
    },

    async updateAdminConfig(config: Record<string, unknown>) {
      const response = await api.put('/api/admin-view/config', config);
      return response.data;
    },

    async getAdminFeedback() {
      const response = await api.get('/api/admin-view/feedback');
      return response.data;
    },

    async updateFeedbackResolution(feedbackId: number, isResolved: boolean) {
      const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, { is_resolved: isResolved });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Health
    // -----------------------------------------------------------------------

    async healthCheck() {
      const response = await api.get('/api/health');
      return response.data;
    },
  };
}
