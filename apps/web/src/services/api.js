/**
 * API client for Beach Volleyball ELO backend
 */

import axios from 'axios';

// In development we use relative /api (empty base) so Next.js proxy decides the backend;
// no compile-time URL is inlined, avoiding .next cache poisoning between dev and E2E.
// In production we use NEXT_PUBLIC_API_URL.
// eslint-disable-next-line no-undef
const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NODE_ENV === 'development' ? '' : (process.env.NEXT_PUBLIC_API_URL || ''))
  : '';

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
 * Get list of players with optional search and filters. Returns { items, total }.
 * @param {Object} params - Optional: { q, location_id, league_id, limit, offset }
 */
/**
 * Get players with optional search and filters. Supports multi-select filters via arrays.
 * @param {Object} params - q, location_id (string or string[]), league_id (number or number[]),
 *   gender (string or string[]), level (string or string[]), limit, offset
 */
export const getPlayers = async (params = {}) => {
  const {
    q,
    location_id,
    league_id,
    gender,
    level,
    limit = 50,
    offset = 0,
  } = params;
  const searchParams = new URLSearchParams();
  if (q != null && q !== '') searchParams.set('q', String(q));
  const locationIds = Array.isArray(location_id) ? location_id : (location_id != null && location_id !== '' ? [location_id] : []);
  locationIds.forEach((id) => searchParams.append('location_id', String(id)));
  const leagueIds = Array.isArray(league_id) ? league_id : (league_id != null && league_id !== '' ? [Number(league_id)] : []);
  leagueIds.forEach((id) => searchParams.append('league_id', String(id)));
  const genders = Array.isArray(gender) ? gender : (gender != null && gender !== '' ? [gender] : []);
  genders.forEach((g) => searchParams.append('gender', String(g)));
  const levels = Array.isArray(level) ? level : (level != null && level !== '' ? [level] : []);
  levels.forEach((l) => searchParams.append('level', String(l)));
  searchParams.set('limit', String(limit));
  searchParams.set('offset', String(offset));
  const response = await api.get(`/api/players?${searchParams.toString()}`);
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
export const getPlayerStats = async (playerId) => {
  const response = await api.get(`/api/players/${playerId}/stats`);
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
 * Get all matches for a season or league with ELO changes
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getMatchesWithElo = async (params) => {
  const response = await api.post('/api/matches/elo', params);
  return response.data;
};

/**
 * Get all matches for a season with ELO changes (backward compatibility)
 */
export const getSeasonMatches = async (seasonId) => {
  return getMatchesWithElo({ season_id: seasonId });
};

/**
 * Get all player stats for a season or league
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getAllPlayerStats = async (params) => {
  const response = await api.post('/api/player-stats', params);
  return response.data;
};

/**
 * Get all player season stats for a season (backward compatibility)
 */
export const getAllPlayerSeasonStats = async (seasonId) => {
  return getAllPlayerStats({ season_id: seasonId });
};

/**
 * Get partnership and opponent stats for a player in a season
 */
export const getPlayerSeasonPartnershipOpponentStats = async (playerId, seasonId) => {
  const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a season or league
 * @param {Object} params - {season_id?: number, league_id?: number}
 */
export const getAllPartnershipOpponentStats = async (params) => {
  const response = await api.post('/api/partnership-opponent-stats', params);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a season (backward compatibility)
 */
export const getAllSeasonPartnershipOpponentStats = async (seasonId) => {
  return getAllPartnershipOpponentStats({ season_id: seasonId });
};

/**
 * Get player stats for a specific league
 */
export const getPlayerLeagueStats = async (playerId, leagueId) => {
  const response = await api.get(`/api/players/${playerId}/league/${leagueId}/stats`);
  return response.data;
};

/**
 * Get all player league stats for a league (backward compatibility)
 */
export const getAllPlayerLeagueStats = async (leagueId) => {
  return getAllPlayerStats({ league_id: leagueId });
};

/**
 * Get partnership and opponent stats for a player in a league
 */
export const getPlayerLeaguePartnershipOpponentStats = async (playerId, leagueId) => {
  const response = await api.get(`/api/players/${playerId}/league/${leagueId}/partnership-opponent-stats`);
  return response.data;
};

/**
 * Get all partnership and opponent stats for all players in a league (backward compatibility)
 */
export const getAllLeaguePartnershipOpponentStats = async (leagueId) => {
  return getAllPartnershipOpponentStats({ league_id: leagueId });
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
export const getPlayerMatchHistory = async (playerId) => {
  const response = await api.get(`/api/players/${playerId}/matches`);
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
 * Get all sessions for a league
 * @param {number} leagueId - ID of the league
 * @returns {Promise<Array>} Array of session objects
 */
export const getSessions = async (leagueId) => {
  if (!leagueId) {
    throw new Error('leagueId is required');
  }
  const response = await api.get(`/api/leagues/${leagueId}/sessions`);
  return response.data;
};

/**
 * Get active session for a league (helper function that filters client-side)
 * @param {number} leagueId - ID of the league
 * @returns {Promise<Object|null>} Active session object or null if none found
 */
export const getActiveSession = async (leagueId) => {
  if (!leagueId) {
    return null;
  }
  // Fetch all sessions and filter for active one on the frontend
  const sessions = await getSessions(leagueId);
  const activeSession = sessions.find(session => session.status === 'ACTIVE');
  return activeSession || null;
};

/**
 * Get open sessions for the current user (creator, has match, or invited).
 * @returns {Promise<Array>} Array of session objects with participation, match_count, etc.
 */
export const getOpenSessions = async () => {
  const response = await api.get('/api/sessions/open');
  return response.data;
};

/**
 * Get a session by its shareable code.
 * @param {string} code - Session code
 * @returns {Promise<Object>} Session object
 */
export const getSessionByCode = async (code) => {
  const response = await api.get(`/api/sessions/by-code/${encodeURIComponent(code)}`);
  return response.data;
};

/**
 * Get all matches for a session.
 * @param {number} sessionId - Session ID
 * @returns {Promise<Array>} Array of match objects
 */
export const getSessionMatches = async (sessionId) => {
  const response = await api.get(`/api/sessions/${sessionId}/matches`);
  return response.data;
};

/**
 * Get list of players in a session (participants + players who have matches).
 */
export const getSessionParticipants = async (sessionId) => {
  const response = await api.get(`/api/sessions/${sessionId}/participants`);
  return response.data;
};

/**
 * Remove a player from session participants. Fails if player has matches in this session.
 */
export const removeSessionParticipant = async (sessionId, playerId) => {
  const response = await api.delete(`/api/sessions/${sessionId}/participants/${playerId}`);
  return response.data;
};

/**
 * Join a session by code (adds current user's player to participants).
 * @param {string} code - Session code
 * @returns {Promise<Object>} { status, message, session }
 */
export const joinSessionByCode = async (code) => {
  const response = await api.post('/api/sessions/join', { code: code.trim().toUpperCase() });
  return response.data;
};

/**
 * Invite a player to a session.
 * @param {number} sessionId - Session ID
 * @param {number} playerId - Player ID to invite
 * @returns {Promise<Object>} { status, message }
 */
export const inviteToSession = async (sessionId, playerId) => {
  const response = await api.post(`/api/sessions/${sessionId}/invite`, { player_id: playerId });
  return response.data;
};

/**
 * Invite multiple players to a session in one request.
 * @param {number} sessionId - Session ID
 * @param {number[]} playerIds - Player IDs to invite
 * @returns {Promise<{ added: number[], failed: { player_id: number, error: string }[] }>}
 */
export const inviteToSessionBatch = async (sessionId, playerIds) => {
  const response = await api.post(`/api/sessions/${sessionId}/invite_batch`, {
    player_ids: Array.isArray(playerIds) ? playerIds : [],
  });
  return response.data;
};

/**
 * Create a new non-league session (with shareable code).
 * @param {Object} payload - { date?, name?, court_id? } – pass { date: '...' } for a specific date
 * @returns {Promise<Object>} { status, message, session } with session.code
 */
export const createSession = async (payload = {}) => {
  const response = await api.post('/api/sessions', { ...payload });
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
 * Update a session's fields (name, date, season_id)
 * @param {number} sessionId - ID of session to update
 * @param {Object} updates - Object with optional fields: name, date, season_id
 * @returns {Promise} Updated session data
 */
export const updateSession = async (sessionId, updates) => {
  const response = await api.patch(`/api/sessions/${sessionId}`, updates);
  return response.data;
};

/**
 * Update a session's season_id (convenience function)
 * @param {number} sessionId - ID of session to update
 * @param {number|null} seasonId - New season_id (can be null to remove season)
 * @returns {Promise} Updated session data
 */
export const updateSessionSeason = async (sessionId, seasonId) => {
  return updateSession(sessionId, { season_id: seasonId });
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
  if (typeof window === 'undefined') {
    throw new Error('exportMatchesToCSV can only be called in the browser');
  }
  
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
 * Query leagues with filters, ordering, and limit
 */
export const queryLeagues = async (filters = {}, options = {}) => {
  const response = await api.post('/api/leagues/query', filters, options);
  return response.data;
};

// Note: we can derive regions from getLocations response (which now includes region info),
// so a dedicated getRegions helper isn't strictly required for the Find Leagues page.

/**
 * Join a public league
 */
export const joinLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join`);
  return response.data;
};

/**
 * Request to join an invite-only league
 */
export const requestToJoinLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/request-join`);
  return response.data;
};

/**
 * Get pending and rejected join requests for a league (admin only).
 * @returns {Promise<{ pending: Array<{ id: number, player_name: string, created_at: string }>, rejected: Array<...> }>}
 */
export const getLeagueJoinRequests = async (leagueId) => {
  const response = await api.get(`/api/leagues/${leagueId}/join-requests`);
  const data = response.data;
  return {
    pending: Array.isArray(data?.pending) ? data.pending : [],
    rejected: Array.isArray(data?.rejected) ? data.rejected : []
  };
};

/**
 * Approve a league join request (admin only)
 */
export const approveLeagueJoinRequest = async (leagueId, requestId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join-requests/${requestId}/approve`);
  return response.data;
};

/**
 * Reject a league join request (admin only)
 */
export const rejectLeagueJoinRequest = async (leagueId, requestId) => {
  const response = await api.post(`/api/leagues/${leagueId}/join-requests/${requestId}/reject`);
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
 * Add multiple players to a league in one request.
 * @param {number} leagueId - League ID
 * @param {Array<{ player_id: number, role?: string }>} members - List of { player_id, role } (role defaults to 'member')
 * @returns {Promise<{ added: Array, failed: Array<{ player_id: number, error: string }> }>}
 */
export const addLeagueMembersBatch = async (leagueId, members) => {
  const response = await api.post(`/api/leagues/${leagueId}/members_batch`, {
    members: Array.isArray(members) ? members : [],
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
 * Leave a league
 */
export const leaveLeague = async (leagueId) => {
  const response = await api.post(`/api/leagues/${leagueId}/leave`);
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
 * Update a season
 */
export const updateSeason = async (seasonId, seasonData) => {
  const response = await api.put(`/api/seasons/${seasonId}`, seasonData);
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
 * Update the current user's account information (name, email)
 */
export const updateUserProfile = async (userData) => {
  const response = await api.put('/api/users/me', userData);
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
 * Get all locations with distances from given coordinates, sorted by closest first
 */
export const getLocationDistances = async (lat, lon) => {
  const response = await api.get('/api/locations/distances', {
    params: { lat, lon }
  });
  return response.data;
};

/**
 * Get city autocomplete suggestions from Geoapify (proxied through backend)
 */
export const getCityAutocomplete = async (text) => {
  const response = await api.get('/api/geocode/autocomplete', {
    params: { text }
  });
  return response.data;
};

/**
 * Logout the current user by invalidating refresh tokens
 */
export const logout = async () => {
  // Even if the logout request fails, we still want to clear local tokens
  // The user is already logged out from the client side
  const response = await api.post('/api/auth/logout');
  return response.data;
};

/** Fetch public location list (regions + locations) for dropdowns. */
export const getPublicLocations = async () => {
  const response = await api.get('/api/public/locations');
  return response.data;
};

/**
 * Court API methods (legacy — admin CRUD)
 */
export const getCourts = async (locationId = null) => {
  const params = locationId ? { location_id: locationId } : {};
  const response = await api.get('/api/courts', { params });
  return response.data;
};

/**
 * Court Discovery API methods (public + auth)
 */

/** List approved courts with optional filters and pagination. */
export const getPublicCourts = async (filters = {}) => {
  const response = await api.get('/api/public/courts', { params: filters });
  return response.data;
};

/** Get full court detail by slug. */
export const getPublicCourtBySlug = async (slug) => {
  const response = await api.get(`/api/public/courts/${slug}`);
  return response.data;
};

/** Get all curated court tags. */
export const getCourtTags = async () => {
  const response = await api.get('/api/public/courts/tags');
  return response.data;
};

/** Get nearby courts by lat/lng. */
export const getNearbyCourts = async (lat, lng, radius = 25, excludeId = null) => {
  const params = { lat, lng, radius };
  if (excludeId) params.exclude = excludeId;
  const response = await api.get('/api/public/courts/nearby', { params });
  return response.data;
};

/** Submit a new court for admin approval. */
export const submitCourt = async (data) => {
  const response = await api.post('/api/courts/submit', data);
  return response.data;
};

/** Update court info (creator or admin). */
export const updateCourtDiscovery = async (courtId, data) => {
  const response = await api.put(`/api/courts/${courtId}/update`, data);
  return response.data;
};

/** Create a review for a court. */
export const createCourtReview = async (courtId, data) => {
  const response = await api.post(`/api/courts/${courtId}/reviews`, data);
  return response.data;
};

/** Update an existing review. */
export const updateCourtReview = async (courtId, reviewId, data) => {
  const response = await api.put(`/api/courts/${courtId}/reviews/${reviewId}`, data);
  return response.data;
};

/** Delete a review. */
export const deleteCourtReview = async (courtId, reviewId) => {
  const response = await api.delete(`/api/courts/${courtId}/reviews/${reviewId}`);
  return response.data;
};

/** Upload a photo to a review (multipart form data). */
export const uploadReviewPhoto = async (courtId, reviewId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/courts/${courtId}/reviews/${reviewId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
};

/** Submit an edit suggestion for a court. */
export const suggestCourtEdit = async (courtId, changes) => {
  const response = await api.post(`/api/courts/${courtId}/suggest-edit`, { changes });
  return response.data;
};

/** List edit suggestions for a court (creator/admin). */
export const getCourtEditSuggestions = async (courtId) => {
  const response = await api.get(`/api/courts/${courtId}/suggestions`);
  return response.data;
};

/** Approve or reject an edit suggestion. */
export const resolveCourtEditSuggestion = async (suggestionId, action) => {
  const response = await api.put(`/api/courts/suggestions/${suggestionId}?action=${action}`);
  return response.data;
};

/** Admin: list pending court submissions. */
export const getAdminPendingCourts = async () => {
  const response = await api.get('/api/admin/courts/pending');
  return response.data;
};

/** Admin: approve a court. */
export const adminApproveCourt = async (courtId) => {
  const response = await api.put(`/api/admin/courts/${courtId}/approve`);
  return response.data;
};

/** Admin: reject a court. */
export const adminRejectCourt = async (courtId) => {
  const response = await api.put(`/api/admin/courts/${courtId}/reject`);
  return response.data;
};

/** Upload a standalone photo to a court (multipart form data). */
export const uploadCourtPhoto = async (courtId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/courts/${courtId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
};

/** Get court leaderboard (top players by match count). */
export const getCourtLeaderboard = async (slug) => {
  const response = await api.get(`/api/public/courts/${slug}/leaderboard`);
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

/**
 * Submit feedback (works for both authenticated and anonymous users)
 */
export const submitFeedback = async ({ feedback, email }) => {
  const response = await api.post('/api/feedback', {
    feedback_text: feedback,
    email: email || undefined
  });
  return response.data;
};

/**
 * Admin View API methods
 */

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
export const updateAdminConfig = async (config) => {
  const response = await api.put('/api/admin-view/config', config);
  return response.data;
};

/**
 * Get all feedback submissions (admin only)
 */
export const getAdminFeedback = async () => {
  const response = await api.get('/api/admin-view/feedback');
  return response.data;
};

/**
 * Update feedback resolution status (admin only)
 */
export const updateFeedbackResolution = async (feedbackId, isResolved) => {
  const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, {
    is_resolved: isResolved
  });
  return response.data;
};

/**
 * Notification API functions
 */

/**
 * Get user notifications with pagination
 */
export const getNotifications = async (params = {}) => {
  const { limit = 50, offset = 0, unreadOnly = false } = params;
  const response = await api.get('/api/notifications', {
    params: { limit, offset, unread_only: unreadOnly }
  });
  return response.data;
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async () => {
  const response = await api.get('/api/notifications/unread-count');
  return response.data;
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (notificationId) => {
  const response = await api.put(`/api/notifications/${notificationId}/read`);
  return response.data;
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async () => {
  const response = await api.put('/api/notifications/mark-all-read');
  return response.data;
};

/**
 * Photo Match Upload API functions
 */

/**
 * Upload a photo of game scores for AI processing
 * @param {number} leagueId - League ID
 * @param {File} file - Image file
 * @param {string} userPrompt - Optional context/instructions
 * @param {number} seasonId - Optional season ID
 */
export const uploadMatchPhoto = async (leagueId, file, userPrompt = null, seasonId = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (userPrompt) {
    formData.append('user_prompt', userPrompt);
  }
  if (seasonId) {
    formData.append('season_id', seasonId);
  }
  
  const response = await api.post(`/api/leagues/${leagueId}/matches/upload-photo`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Get status of a photo processing job
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 */
export const getPhotoJobStatus = async (leagueId, jobId) => {
  const response = await api.get(`/api/leagues/${leagueId}/matches/photo-jobs/${jobId}`);
  return response.data;
};

/**
 * Returns the SSE stream URL for a photo job (for use with fetch + credentials).
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 * @returns {string} Full URL for GET .../photo-jobs/{jobId}/stream
 */
export const getPhotoJobStreamUrl = (leagueId, jobId) => {
  const base = API_BASE_URL || (isBrowser ? '' : '');
  return `${base}/api/leagues/${leagueId}/matches/photo-jobs/${jobId}/stream`;
};

/**
 * Subscribe to photo job progress via SSE. Uses fetch with credentials so auth headers are sent.
 * Call the returned abort function to close the stream.
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 * @param {{ onPartial: (data: { partial_matches: unknown[] }) => void, onDone: (data: { status: string, result?: unknown }) => void, onError: (data: { message: string }) => void }} callbacks
 * @returns {() => void} Abort function to close the stream
 */
export const subscribePhotoJobStream = (leagueId, jobId, callbacks) => {
  const url = getPhotoJobStreamUrl(leagueId, jobId);
  const { accessToken } = getStoredTokens();
  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers },
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        callbacks.onError({ message: response.status === 404 ? 'Job not found' : response.status === 403 ? 'Access denied' : `Request failed: ${response.status}` });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const processMessage = (block) => {
        let eventName = '';
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
        }
        if (!eventName || !dataStr) return;
        try {
          const data = JSON.parse(dataStr);
          if (eventName === 'partial') callbacks.onPartial(data);
          else if (eventName === 'done') callbacks.onDone(data);
          else if (eventName === 'error') callbacks.onError(data);
        } catch (_) {}
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const block of parts) {
          if (block.trim()) processMessage(block);
        }
      }
      if (buffer.trim()) processMessage(buffer);
    } catch (err) {
      if (err.name === 'AbortError') return;
      callbacks.onError({ message: err.message || 'Stream error' });
    }
  })();

  return () => controller.abort();
};

/**
 * Send edit prompt for photo results refinement
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 * @param {string} editPrompt - Edit/clarification prompt
 */
export const editPhotoResults = async (leagueId, sessionId, editPrompt) => {
  const response = await api.post(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}/edit`,
    { edit_prompt: editPrompt }
  );
  return response.data;
};

/**
 * Confirm parsed matches and create them in the database
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 * @param {number} seasonId - Season to create matches in
 * @param {string} matchDate - Date for the matches (YYYY-MM-DD)
 */
export const confirmPhotoMatches = async (leagueId, sessionId, seasonId, matchDate) => {
  const response = await api.post(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}/confirm`,
    { season_id: seasonId, match_date: matchDate }
  );
  return response.data;
};

/**
 * Cancel photo session and cleanup
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 */
export const cancelPhotoSession = async (leagueId, sessionId) => {
  const response = await api.delete(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}`
  );
  return response.data;
};

// ============================================================================
// Friends API
// ============================================================================

/**
 * Send a friend request to another player.
 * @param {number} receiverPlayerId - Player ID to send request to
 */
export const sendFriendRequest = async (receiverPlayerId) => {
  const response = await api.post('/api/friends/request', {
    receiver_player_id: receiverPlayerId,
  });
  return response.data;
};

/**
 * Accept a pending friend request.
 * @param {number} requestId - Friend request ID
 */
export const acceptFriendRequest = async (requestId) => {
  const response = await api.post(`/api/friends/requests/${requestId}/accept`);
  return response.data;
};

/**
 * Decline a pending friend request.
 * @param {number} requestId - Friend request ID
 */
export const declineFriendRequest = async (requestId) => {
  const response = await api.post(`/api/friends/requests/${requestId}/decline`);
  return response.data;
};

/**
 * Cancel an outgoing friend request.
 * @param {number} requestId - Friend request ID
 */
export const cancelFriendRequest = async (requestId) => {
  const response = await api.delete(`/api/friends/requests/${requestId}`);
  return response.data;
};

/**
 * Remove a friend (unfriend).
 * @param {number} playerId - Player ID to unfriend
 */
export const removeFriend = async (playerId) => {
  const response = await api.delete(`/api/friends/${playerId}`);
  return response.data;
};

/**
 * Get current user's friends list (paginated).
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Items per page
 */
export const getFriends = async (page = 1, pageSize = 50) => {
  const response = await api.get('/api/friends', {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

/**
 * Get pending friend requests.
 * @param {string} direction - "incoming", "outgoing", or "both"
 */
export const getFriendRequests = async (direction = 'both') => {
  const response = await api.get('/api/friends/requests', {
    params: { direction },
  });
  return response.data;
};

/**
 * Get friend suggestions based on shared leagues.
 * @param {number} limit - Max suggestions
 */
export const getFriendSuggestions = async (limit = 10) => {
  const response = await api.get('/api/friends/suggestions', {
    params: { limit },
  });
  return response.data;
};

/**
 * Get friend status for multiple player IDs (for search results/player cards).
 * @param {number[]} playerIds - Player IDs to check
 * @returns {Promise<{statuses: Object, mutual_counts: Object}>}
 */
export const batchFriendStatus = async (playerIds) => {
  const response = await api.post('/api/friends/batch-status', {
    player_ids: playerIds,
  });
  return response.data;
};

/**
 * Get mutual friends between current user and another player.
 * @param {number} otherPlayerId - Other player's ID
 */
export const getMutualFriends = async (otherPlayerId) => {
  const response = await api.get(`/api/friends/mutual/${otherPlayerId}`);
  return response.data;
};

/**
 * Search publicly visible players with optional filters.
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.search] - Search by player name
 * @param {string} [params.location_id] - Filter by location ID
 * @param {string} [params.gender] - Filter by gender
 * @param {string} [params.level] - Filter by skill level
 * @param {number} [params.page] - Page number (1-based)
 * @param {number} [params.page_size] - Items per page
 * @returns {Promise<{items: Array, total_count: number}>}
 */
export const getPublicPlayers = async (params = {}, options = {}) => {
  const response = await api.get('/api/public/players', { params, ...options });
  return response.data;
};

/**
 * Upload a new avatar image for the current user.
 *
 * @param {File|Blob} file - Image file or blob to upload
 * @returns {Promise<{ profile_picture_url: string }>}
 */
export const uploadAvatar = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Delete the current user's avatar, reverting to initials.
 *
 * @returns {Promise<{ message: string }>}
 */
export const deleteAvatar = async () => {
  const response = await api.delete('/api/users/me/avatar');
  return response.data;
};

/**
 * Placeholder Player API functions
 */

/**
 * Create a placeholder player with an invite link.
 * @param {Object} data - { name: string, phone_number?: string, league_id?: number }
 * @returns {Promise<{ player_id: number, name: string, invite_token: string, invite_url: string }>}
 */
export const createPlaceholderPlayer = async (data) => {
  const response = await api.post('/api/players/placeholder', data);
  return response.data;
};

/**
 * List placeholder players created by the current user.
 * @returns {Promise<{ placeholders: Array<{ player_id, name, phone_number, match_count, invite_token, invite_url, status, created_at }> }>}
 */
export const listPlaceholderPlayers = async () => {
  const response = await api.get('/api/players/placeholder');
  return response.data;
};

/**
 * Delete a placeholder player (replaces with Unknown Player in matches).
 * @param {number} playerId - Placeholder player ID
 * @returns {Promise<{ affected_matches: number }>}
 */
export const deletePlaceholderPlayer = async (playerId) => {
  const response = await api.delete(`/api/players/placeholder/${playerId}`);
  return response.data;
};

/**
 * Get the invite URL for a placeholder player.
 * @param {number} playerId - Placeholder player ID
 * @returns {Promise<{ invite_url: string }>}
 */
export const getPlayerInviteUrl = async (playerId) => {
  const response = await api.get(`/api/players/${playerId}/invite-url`);
  return response.data;
};

/**
 * Get invite details for landing page (public endpoint).
 * @param {string} token - Invite token
 * @returns {Promise<{ inviter_name, placeholder_name, match_count, league_names, status }>}
 */
export const getInviteDetails = async (token) => {
  const response = await api.get(`/api/invites/${encodeURIComponent(token)}`);
  return response.data;
};

/**
 * Claim an invite (link placeholder to current user).
 * @param {string} token - Invite token
 * @returns {Promise<{ success, message, player_id, warnings, redirect_url }>}
 */
export const claimInvite = async (token) => {
  const response = await api.post(`/api/invites/${encodeURIComponent(token)}/claim`);
  return response.data;
};

export default api;
