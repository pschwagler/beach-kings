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

export const getStoredTokens = () => {
  // Always read from localStorage to ensure we get the latest values
  // This is especially important on page refresh
  if (isBrowser) {
    const storedAccess = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefresh = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    // Update the authTokens object to keep it in sync
    authTokens.accessToken = storedAccess;
    authTokens.refreshToken = storedRefresh;
  }
  return {
    accessToken: authTokens.accessToken,
    refreshToken: authTokens.refreshToken,
  };
};

api.interceptors.request.use(
  (config) => {
    // Always use the latest token from the authTokens object
    // This ensures we use the token even if it was just refreshed
    const token = authTokens.accessToken;
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
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
    const url = originalRequest.url || '';
    // Only exclude endpoints that don't require authentication
    // Endpoints like /api/auth/me, /api/auth/logout DO require auth and should trigger refresh
    const shouldSkipRefresh = url.includes('/api/auth/login') ||
                               url.includes('/api/auth/signup') ||
                               url.includes('/api/auth/refresh') ||
                               url.includes('/api/auth/send-verification') ||
                               url.includes('/api/auth/verify-phone') ||
                               url.includes('/api/auth/reset-password') ||
                               url.includes('/api/auth/reset-password-verify') ||
                               url.includes('/api/auth/reset-password-confirm') ||
                               url.includes('/api/auth/sms-login') ||
                               url.includes('/api/auth/check-phone');

    if (
      isUnauthorized &&
      authTokens.refreshToken &&
      !originalRequest._retry &&
      !shouldSkipRefresh
    ) {
      originalRequest._retry = true;
      try {
        // Get the latest refresh token from storage in case it was updated
        const latestRefreshToken = isBrowser 
          ? window.localStorage.getItem(REFRESH_TOKEN_KEY) 
          : authTokens.refreshToken;
        
        if (!latestRefreshToken) {
          clearAuthTokens();
          return Promise.reject(error);
        }
        
        const { data } = await refreshClient.post('/api/auth/refresh', {
          refresh_token: latestRefreshToken,
        });
        setAuthTokens(data.access_token);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${authTokens.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and reject
        clearAuthTokens();
        return Promise.reject(error);
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
/**
 * Query rankings with filters (e.g., by season_id)
 */
export const getRankings = async (queryParams = {}) => {
  const response = await api.post('/api/rankings', queryParams);
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
 * Query matches with filters (e.g., by league_id, season_id)
 */
export const queryMatches = async (queryParams) => {
  const response = await api.post('/api/matches/search', queryParams);
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
  const response = await api.get('/api/sessions?active=true');
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
 * Lock in a session (update session to set is_pending to false)
 */
export const lockInSession = async (sessionId) => {
  const response = await api.patch(`/api/sessions/${sessionId}`, { is_pending: false });
  return response.data;
};

/**
 * Lock in a league session (update session to set is_pending to false)
 */
export const lockInLeagueSession = async (leagueId, sessionId) => {
  const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { is_pending: false });
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
 * Create a new match
 */
export const createMatch = async (matchData) => {
  const response = await api.post('/api/matches', matchData);
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

/**
 * Create a new league
 */
export const createLeague = async (leagueData) => {
  const response = await api.post('/api/leagues', leagueData);
  return response.data;
};

/**
 * List all leagues
 */
export const listLeagues = async () => {
  const response = await api.get('/api/leagues');
  return response.data;
};

/**
 * Get a specific league
 */
export const getLeague = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}`);
  return response.data;
};

/**
 * Get seasons for a league
 */
export const getLeagueSeasons = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/seasons`);
  return response.data;
};

/**
 * Get members of a league
 */
export const getLeagueMembers = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/members`);
  return response.data;
};

/**
 * Get leagues for the current authenticated user
 */
export const getUserLeagues = async () => {
  const response = await api.get('/api/users/me/leagues');
  return response.data;
};

/**
 * Add a player to a league
 */
export const addLeagueMember = async (leagueId, playerId, role = 'member') => {
  const response = await api.post(`/api/leagues/${leagueId}/members`, {
    player_id: playerId,
    role
  });
  return response.data;
};

/**
 * Remove a member from a league
 */
export const removeLeagueMember = async (leagueId, memberId) => {
  const response = await api.delete(`/api/leagues/${leagueId}/members/${memberId}`);
  return response.data;
};

/**
 * Update a league member's role
 */
export const updateLeagueMember = async (leagueId, memberId, role) => {
  const response = await api.put(`/api/leagues/${leagueId}/members/${memberId}`, {
    role
  });
  return response.data;
};

/**
 * Create a season for a league
 */
export const createLeagueSeason = async (leagueId, seasonData) => {
  const response = await api.post(`/api/leagues/${leagueId}/seasons`, seasonData);
  return response.data;
};

/**
 * Create a session for a league
 */
export const createLeagueSession = async (leagueId, sessionData) => {
  const response = await api.post(`/api/leagues/${leagueId}/sessions`, sessionData);
  return response.data;
};

/**
 * Update a league
 */
export const updateLeague = async (leagueId, leagueData) => {
  const response = await api.put(`/api/leagues/${leagueId}`, leagueData);
  return response.data;
};

/**
 * Get the current user's player profile
 */
export const getCurrentUserPlayer = async () => {
  const response = await api.get('/api/users/me/player');
  return response.data;
};

/**
 * Update the current user's player profile
 */
export const updatePlayerProfile = async (playerData) => {
  const response = await api.put('/api/users/me/player', playerData);
  return response.data;
};

/**
 * Get list of locations
 */
export const getLocations = async () => {
  const response = await api.get('/api/locations');
  return response.data;
};

/**
 * Logout the current user by invalidating refresh tokens
 */
export const logout = async () => {
  try {
    const response = await api.post('/api/auth/logout');
    return response.data;
  } catch (error) {
    // Even if the logout request fails, we still want to clear local tokens
    // The user is already logged out from the client side
    throw error;
  }
};

export default api;

