/**
 * API Client for Beach Volleyball ELO backend
 * Platform-agnostic API client with storage adapter support
 */

import { createApiClient } from './createApiClient';
import { webStorageAdapter, setStorageAdapter } from './adapters/storage';

// Default to web storage adapter
setStorageAdapter(webStorageAdapter);

/**
 * Initialize the API client
 * @param {string} baseURL - Base URL for API requests
 * @param {Object} options - Additional options
 * @returns {Object} API client with all methods
 */
export function initApiClient(baseURL = '', options = {}) {
  const { api, setAuthTokens, clearAuthTokens, getStoredTokens } = createApiClient(baseURL, options);

  // Export all API methods
  const apiMethods = {
    // Auth token management
    setAuthTokens,
    clearAuthTokens,
    getStoredTokens,

    // Rankings
    getRankings: async (queryParams = {}) => {
      const response = await api.post('/api/rankings', queryParams);
      return response.data;
    },

    // Players
    getPlayers: async () => {
      const response = await api.get('/api/players');
      return response.data;
    },
    createPlayer: async (name) => {
      const response = await api.post('/api/players', { name });
      return response.data;
    },
    getPlayerStats: async (playerName) => {
      const response = await api.get(`/api/players/${encodeURIComponent(playerName)}`);
      return response.data;
    },
    getPlayerSeasonStats: async (playerId, seasonId) => {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/stats`);
      return response.data;
    },
    getPlayerMatchHistory: async (playerName) => {
      const response = await api.get(`/api/players/${encodeURIComponent(playerName)}/matches`);
      return response.data;
    },
    getPlayerSeasonPartnershipOpponentStats: async (playerId, seasonId) => {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // Matches
    getMatches: async () => {
      const response = await api.get('/api/matches');
      return response.data;
    },
    queryMatches: async (queryParams) => {
      const response = await api.post('/api/matches/search', queryParams);
      return response.data;
    },
    createMatch: async (matchData) => {
      const response = await api.post('/api/matches', matchData);
      return response.data;
    },
    updateMatch: async (matchId, matchData) => {
      const response = await api.put(`/api/matches/${matchId}`, matchData);
      return response.data;
    },
    deleteMatch: async (matchId) => {
      const response = await api.delete(`/api/matches/${matchId}`);
      return response.data;
    },
    exportMatchesToCSV: async () => {
      if (typeof window === 'undefined') {
        throw new Error('exportMatchesToCSV can only be called in the browser');
      }
      const response = await api.get('/api/matches/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'matches_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },

    // Seasons
    getSeasonMatches: async (seasonId) => {
      const response = await api.get(`/api/seasons/${seasonId}/matches`);
      return response.data;
    },
    getAllPlayerSeasonStats: async (seasonId) => {
      const response = await api.get(`/api/seasons/${seasonId}/player-stats`);
      return response.data;
    },
    getAllSeasonPartnershipOpponentStats: async (seasonId) => {
      const response = await api.get(`/api/seasons/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // Leagues
    createLeague: async (leagueData) => {
      const response = await api.post('/api/leagues', leagueData);
      return response.data;
    },
    listLeagues: async () => {
      const response = await api.get('/api/leagues');
      return response.data;
    },
    getLeague: async (leagueId) => {
      const response = await api.get(`/api/leagues/${leagueId}`);
      return response.data;
    },
    updateLeague: async (leagueId, leagueData) => {
      const response = await api.put(`/api/leagues/${leagueId}`, leagueData);
      return response.data;
    },
    getLeagueSeasons: async (leagueId) => {
      const response = await api.get(`/api/leagues/${leagueId}/seasons`);
      return response.data;
    },
    getLeagueMembers: async (leagueId) => {
      const response = await api.get(`/api/leagues/${leagueId}/members`);
      return response.data;
    },
    getUserLeagues: async () => {
      const response = await api.get('/api/users/me/leagues');
      return response.data;
    },
    addLeagueMember: async (leagueId, playerId, role = 'member') => {
      const response = await api.post(`/api/leagues/${leagueId}/members`, {
        player_id: playerId,
        role
      });
      return response.data;
    },
    removeLeagueMember: async (leagueId, memberId) => {
      const response = await api.delete(`/api/leagues/${leagueId}/members/${memberId}`);
      return response.data;
    },
    leaveLeague: async (leagueId) => {
      const response = await api.post(`/api/leagues/${leagueId}/leave`);
      return response.data;
    },
    updateLeagueMember: async (leagueId, memberId, role) => {
      const response = await api.put(`/api/leagues/${leagueId}/members/${memberId}`, {
        role
      });
      return response.data;
    },
    createLeagueSeason: async (leagueId, seasonData) => {
      const response = await api.post(`/api/leagues/${leagueId}/seasons`, seasonData);
      return response.data;
    },
    createLeagueSession: async (leagueId, sessionData) => {
      const response = await api.post(`/api/leagues/${leagueId}/sessions`, sessionData);
      return response.data;
    },
    lockInLeagueSession: async (leagueId, sessionId) => {
      const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
      return response.data;
    },
    getLeagueMessages: async (leagueId) => {
      const response = await api.get(`/api/leagues/${leagueId}/messages`);
      return response.data;
    },
    createLeagueMessage: async (leagueId, message) => {
      const response = await api.post(`/api/leagues/${leagueId}/messages`, { message });
      return response.data;
    },

    // Sessions
    getSessions: async () => {
      const response = await api.get('/api/sessions');
      return response.data;
    },
    getActiveSession: async () => {
      const response = await api.get('/api/sessions?active=true');
      return response.data;
    },
    createSession: async (date = null) => {
      const response = await api.post('/api/sessions', { date });
      return response.data;
    },
    lockInSession: async (sessionId) => {
      const response = await api.patch(`/api/sessions/${sessionId}`, { submit: true });
      return response.data;
    },
    deleteSession: async (sessionId) => {
      const response = await api.delete(`/api/sessions/${sessionId}`);
      return response.data;
    },

    // Users
    getCurrentUserPlayer: async () => {
      const response = await api.get('/api/users/me/player');
      return response.data;
    },
    updatePlayerProfile: async (playerData) => {
      const response = await api.put('/api/users/me/player', playerData);
      return response.data;
    },
    updateUserProfile: async (userData) => {
      const response = await api.put('/api/users/me', userData);
      return response.data;
    },

    // Locations
    getLocations: async () => {
      const response = await api.get('/api/locations');
      return response.data;
    },
    getLocationDistances: async (lat, lon) => {
      const response = await api.get('/api/locations/distances', {
        params: { lat, lon }
      });
      return response.data;
    },
    getCityAutocomplete: async (text) => {
      const response = await api.get('/api/geocode/autocomplete', {
        params: { text }
      });
      return response.data;
    },

    // Courts
    getCourts: async (locationId = null) => {
      const params = locationId ? { location_id: locationId } : {};
      const response = await api.get('/api/courts', { params });
      return response.data;
    },

    // Weekly Schedules
    createWeeklySchedule: async (seasonId, scheduleData) => {
      const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
      return response.data;
    },
    getWeeklySchedules: async (seasonId) => {
      const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
      return response.data;
    },
    updateWeeklySchedule: async (scheduleId, scheduleData) => {
      const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
      return response.data;
    },
    deleteWeeklySchedule: async (scheduleId) => {
      const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
      return response.data;
    },

    // Signups
    createSignup: async (seasonId, signupData) => {
      const response = await api.post(`/api/seasons/${seasonId}/signups`, signupData);
      return response.data;
    },
    getSignups: async (seasonId, options = {}) => {
      const params = new URLSearchParams();
      if (options.upcoming_only) params.append('upcoming_only', 'true');
      if (options.past_only) params.append('past_only', 'true');
      if (options.include_players) params.append('include_players', 'true');
      const queryString = params.toString();
      const url = `/api/seasons/${seasonId}/signups${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      return response.data;
    },
    getSignup: async (signupId) => {
      const response = await api.get(`/api/signups/${signupId}`);
      return response.data;
    },
    updateSignup: async (signupId, signupData) => {
      const response = await api.put(`/api/signups/${signupId}`, signupData);
      return response.data;
    },
    deleteSignup: async (signupId) => {
      const response = await api.delete(`/api/signups/${signupId}`);
      return response.data;
    },
    signupForSignup: async (signupId) => {
      const response = await api.post(`/api/signups/${signupId}/signup`);
      return response.data;
    },
    dropoutFromSignup: async (signupId) => {
      const response = await api.post(`/api/signups/${signupId}/dropout`);
      return response.data;
    },
    getSignupPlayers: async (signupId) => {
      const response = await api.get(`/api/signups/${signupId}/players`);
      return response.data;
    },
    getSignupEvents: async (signupId) => {
      const response = await api.get(`/api/signups/${signupId}/events`);
      return response.data;
    },

    // ELO Timeline
    getEloTimeline: async () => {
      const response = await api.get('/api/elo-timeline');
      return response.data;
    },

    // Auth
    login: async (credentials) => {
      const response = await api.post('/api/auth/login', credentials);
      return response.data;
    },
    signup: async (signupData) => {
      const response = await api.post('/api/auth/signup', signupData);
      return response.data;
    },
    sendVerification: async (phoneData) => {
      const response = await api.post('/api/auth/send-verification', phoneData);
      return response.data;
    },
    verifyPhone: async (verifyData) => {
      const response = await api.post('/api/auth/verify-phone', verifyData);
      return response.data;
    },
    smsLogin: async (smsData) => {
      const response = await api.post('/api/auth/sms-login', smsData);
      return response.data;
    },
    checkPhone: async (phone) => {
      const response = await api.get('/api/auth/check-phone', {
        params: { phone }
      });
      return response.data;
    },
    getCurrentUser: async () => {
      const response = await api.get('/api/auth/me');
      return response.data;
    },
    resetPassword: async (resetData) => {
      const response = await api.post('/api/auth/reset-password', resetData);
      return response.data;
    },
    resetPasswordVerify: async (verifyData) => {
      const response = await api.post('/api/auth/reset-password-verify', verifyData);
      return response.data;
    },
    resetPasswordConfirm: async (confirmData) => {
      const response = await api.post('/api/auth/reset-password-confirm', confirmData);
      return response.data;
    },
    logout: async () => {
      const response = await api.post('/api/auth/logout');
      return response.data;
    },

    // Feedback
    submitFeedback: async ({ feedback, email }) => {
      const response = await api.post('/api/feedback', {
        feedback_text: feedback,
        email: email || undefined
      });
      return response.data;
    },

    // Admin
    getAdminConfig: async () => {
      const response = await api.get('/api/admin-view/config');
      return response.data;
    },
    updateAdminConfig: async (config) => {
      const response = await api.put('/api/admin-view/config', config);
      return response.data;
    },
    getAdminFeedback: async () => {
      const response = await api.get('/api/admin-view/feedback');
      return response.data;
    },
    updateFeedbackResolution: async (feedbackId, isResolved) => {
      const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, {
        is_resolved: isResolved
      });
      return response.data;
    },

    // Health
    healthCheck: async () => {
      const response = await api.get('/api/health');
      return response.data;
    },
  };

  return apiMethods;
}

// Export storage adapter utilities
export { webStorageAdapter, setStorageAdapter, getStorageAdapter } from './adapters/storage';
export { createApiClient } from './createApiClient';





