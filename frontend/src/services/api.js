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
  if (isBrowser) {
    authTokens.accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    authTokens.refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
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

// Queue to handle concurrent refresh attempts - only one refresh at a time
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Public endpoints that should never trigger token refresh
const PUBLIC_AUTH_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/send-verification',
  '/api/auth/verify-phone',
  '/api/auth/reset-password',
  '/api/auth/reset-password-verify',
  '/api/auth/reset-password-confirm',
  '/api/auth/sms-login',
  '/api/auth/check-phone'
];

const isPublicAuthEndpoint = (url) => {
  if (!url) return false;
  return PUBLIC_AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const isUnauthorized = error.response?.status === 401;
    const isForbidden = error.response?.status === 403;
    const url = originalRequest.url || '';

    // Handle 403 Forbidden - show login modal
    if (isForbidden && isBrowser) {
      // Dispatch a custom event to trigger login modal
      window.dispatchEvent(new CustomEvent('show-login-modal', { 
        detail: { reason: 'forbidden' } 
      }));
    }

    // Skip refresh for public endpoints that don't require authentication
    if (isUnauthorized && isPublicAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    // If we're already refreshing, queue this request to retry after refresh
    if (isUnauthorized && isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(token => {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch(err => {
          return Promise.reject(err);
        });
    }

    // Attempt to refresh token if unauthorized and we have a refresh token
    if (
      isUnauthorized &&
      authTokens.refreshToken &&
      !originalRequest._retry &&
      !isPublicAuthEndpoint(url)
    ) {
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Get the latest refresh token from storage
        const latestRefreshToken = isBrowser 
          ? window.localStorage.getItem(REFRESH_TOKEN_KEY) 
          : authTokens.refreshToken;
        
        if (!latestRefreshToken) {
          clearAuthTokens();
          isRefreshing = false;
          processQueue(error, null);
          return Promise.reject(error);
        }
        
        const { data } = await refreshClient.post('/api/auth/refresh', {
          refresh_token: latestRefreshToken,
        });
        
        // Update tokens with the new access token
        setAuthTokens(data.access_token);
        
        // Use the new token directly from the response
        const newAccessToken = data.access_token;
        
        // Process queued requests with the new token
        isRefreshing = false;
        processQueue(null, newAccessToken);
        
        // Retry the original request with the new token
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and reject all queued requests
        clearAuthTokens();
        isRefreshing = false;
        processQueue(refreshError, null);
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
 * Get player stats for a specific season
 */
export const getPlayerSeasonStats = async (playerId, seasonId) => {
  const response = await api.get(`/api/players/${playerId}/season/${seasonId}/stats`);
  return response.data;
};

/**
 * Get all matches for a season with ELO changes
 */
export const getSeasonMatches = async (seasonId) => {
  const response = await api.get(`/api/seasons/${seasonId}/matches`);
  return response.data;
};

/**
 * Get all player season stats for a season
 */
export const getAllPlayerSeasonStats = async (seasonId) => {
  const response = await api.get(`/api/seasons/${seasonId}/player-stats`);
  return response.data;
};

/**
 * Get partnership and opponent stats for a player in a season
 */
export const getPlayerSeasonPartnershipOpponentStats = async (playerId, seasonId) => {
  const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a season
 */
export const getAllSeasonPartnershipOpponentStats = async (seasonId) => {
  const response = await api.get(`/api/seasons/${seasonId}/partnership-opponent-stats`);
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
 * Lock in a session (submit session)
 */
export const lockInSession = async (sessionId) => {
  const response = await api.patch(`/api/sessions/${sessionId}`, { submit: true });
  return response.data;
};

/**
 * Lock in a league session (submit session)
 */
export const lockInLeagueSession = async (leagueId, sessionId) => {
  const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
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

/**
 * Court API methods
 */
export const getCourts = async (locationId = null) => {
  const params = locationId ? { location_id: locationId } : {};
  const response = await api.get('/api/courts', { params });
  return response.data;
};

/**
 * Weekly Schedule API methods
 */

/**
 * Create a weekly schedule for a season
 */
export const createWeeklySchedule = async (seasonId, scheduleData) => {
  const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
  return response.data;
};

/**
 * Get weekly schedules for a season
 */
export const getWeeklySchedules = async (seasonId) => {
  const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
  return response.data;
};

/**
 * Update a weekly schedule
 */
export const updateWeeklySchedule = async (scheduleId, scheduleData) => {
  const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
  return response.data;
};

/**
 * Delete a weekly schedule
 */
export const deleteWeeklySchedule = async (scheduleId) => {
  const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
  return response.data;
};

/**
 * Signup API methods
 */

/**
 * Create an ad-hoc signup for a season
 */
export const createSignup = async (seasonId, signupData) => {
  const response = await api.post(`/api/seasons/${seasonId}/signups`, signupData);
  return response.data;
};

/**
 * Get signups for a season
 */
export const getSignups = async (seasonId, options = {}) => {
  const params = new URLSearchParams();
  if (options.upcoming_only) params.append('upcoming_only', 'true');
  if (options.past_only) params.append('past_only', 'true');
  if (options.include_players) params.append('include_players', 'true');
  const queryString = params.toString();
  const url = `/api/seasons/${seasonId}/signups${queryString ? `?${queryString}` : ''}`;
  const response = await api.get(url);
  return response.data;
};

/**
 * Get a signup by ID with players list
 */
export const getSignup = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}`);
  return response.data;
};

/**
 * Update a signup
 */
export const updateSignup = async (signupId, signupData) => {
  const response = await api.put(`/api/signups/${signupId}`, signupData);
  return response.data;
};

/**
 * Delete a signup
 */
export const deleteSignup = async (signupId) => {
  const response = await api.delete(`/api/signups/${signupId}`);
  return response.data;
};

/**
 * Sign up a player for a signup
 */
export const signupForSignup = async (signupId) => {
  const response = await api.post(`/api/signups/${signupId}/signup`);
  return response.data;
};

/**
 * Drop out a player from a signup
 */
export const dropoutFromSignup = async (signupId) => {
  const response = await api.post(`/api/signups/${signupId}/dropout`);
  return response.data;
};

/**
 * Get players signed up for a signup
 */
export const getSignupPlayers = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}/players`);
  return response.data;
};

/**
 * Get event log for a signup
 */
export const getSignupEvents = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}/events`);
  return response.data;
};

/**
 * Get league messages
 */
export const getLeagueMessages = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/messages`);
  return response.data;
};

/**
 * Create a league message
 */
export const createLeagueMessage = async (leagueId, message) => {
  const response = await api.post(`/api/leagues/${leagueId}/messages`, { message });
  return response.data;
};

export default api;

