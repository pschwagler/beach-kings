/**
 * API client for Beach Volleyball ELO backend
 */

import axios from 'axios';

// Base URL - empty string for same-origin, or set to API URL for development
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';
const isBrowser = typeof window !== 'undefined';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const authTokens = {
  accessToken: isBrowser ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null,
  refreshToken: isBrowser ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null,
};

export const setAuthTokens = (accessToken, refreshToken = authTokens.refreshToken) => {
  authTokens.accessToken = accessToken;
  if (isBrowser) {
    if (accessToken) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  if (typeof refreshToken !== 'undefined') {
    authTokens.refreshToken = refreshToken;
    if (isBrowser) {
      if (refreshToken) {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }
};

export const clearAuthTokens = () => {
  authTokens.accessToken = null;
  authTokens.refreshToken = null;
  if (isBrowser) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

export const getStoredTokens = () => ({
  accessToken: authTokens.accessToken,
  refreshToken: authTokens.refreshToken,
});

api.interceptors.request.use(
  (config) => {
    if (authTokens.accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${authTokens.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const isUnauthorized = error.response?.status === 401;
    const isAuthEndpoint = originalRequest.url?.includes('/api/auth/');

    if (
      isUnauthorized &&
      authTokens.refreshToken &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      try {
        const { data } = await refreshClient.post('/api/auth/refresh', {
          refresh_token: authTokens.refreshToken,
        });
        setAuthTokens(data.access_token);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${authTokens.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearAuthTokens();
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Load matches from Google Sheets and calculate statistics
 */
export const loadFromSheets = async () => {
  const response = await api.post('/api/loadsheets');
  return response.data;
};

/**
 * Get current rankings
 */
export const getRankings = async () => {
  const response = await api.get('/api/rankings');
  return response.data;
};

/**
 * Get list of all players
 */
export const getPlayers = async () => {
  const response = await api.get('/api/players');
  return response.data;
};

/**
 * Create a new player
 */
export const createPlayer = async (name) => {
  const response = await api.post('/api/players', { name });
  return response.data;
};

/**
 * Get detailed stats for a specific player
 */
export const getPlayerStats = async (playerName) => {
  const response = await api.get(`/api/players/${encodeURIComponent(playerName)}`);
  return response.data;
};

/**
 * Get ELO timeline for all players
 */
export const getEloTimeline = async () => {
  const response = await api.get('/api/elo-timeline');
  return response.data;
};

/**
 * Get all matches
 */
export const getMatches = async () => {
  const response = await api.get('/api/matches');
  return response.data;
};

/**
 * Get match history for a specific player
 */
export const getPlayerMatchHistory = async (playerName) => {
  const response = await api.get(`/api/players/${encodeURIComponent(playerName)}/matches`);
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
 * Get all sessions
 */
export const getSessions = async () => {
  const response = await api.get('/api/sessions');
  return response.data;
};

/**
 * Get active session
 */
export const getActiveSession = async () => {
  const response = await api.get('/api/sessions/active');
  return response.data;
};

/**
 * Create a new session
 */
export const createSession = async (date = null) => {
  const response = await api.post('/api/sessions', { date });
  return response.data;
};

/**
 * Lock in a session
 */
export const lockInSession = async (sessionId) => {
  const response = await api.post(`/api/sessions/${sessionId}/lockin`);
  return response.data;
};

/**
 * Delete a session
 */
export const deleteSession = async (sessionId) => {
  const response = await api.delete(`/api/sessions/${sessionId}`);
  return response.data;
};

/**
 * End a session (legacy - use lockInSession instead)
 */
export const endSession = async (sessionId) => {
  const response = await api.post(`/api/sessions/${sessionId}/end`);
  return response.data;
};

/**
 * Create a new match
 */
export const createMatch = async (matchData) => {
  const response = await api.post('/api/matches/create', matchData);
  return response.data;
};

/**
 * Update an existing match
 */
export const updateMatch = async (matchId, matchData) => {
  const response = await api.put(`/api/matches/${matchId}`, matchData);
  return response.data;
};

// Delete an existing match
export const deleteMatch = async (matchId) => {
  const response = await api.delete(`/api/matches/${matchId}`);
  return response.data;
};

/**
 * Export all matches to CSV
 */
export const exportMatchesToCSV = async () => {
  const response = await api.get('/api/matches/export', {
    responseType: 'blob'
  });
  
  // Create a download link and trigger it
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'matches_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default api;

